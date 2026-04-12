"""
screenshot_auto_capture.py - Persistent Profile & Strict Tools Version
"""
# 概要: ブラウザ操作自動化ライブラリ browser-use を使用して、Webサイトのスクリーンショットを自動撮影するスクリプト。
# 役割: 開発環境や検証環境（Staging）における画面キャプチャ作業を自動化し、ドキュメント作成やUI変更の履歴管理を支援する。
# コンテキスト: browser-use v0.12.6 の CDP に基づくアーキテクチャに適応させ、遅延読み込み（Lazy Loading）を考慮したフルページキャプチャを実現している。
# 更新履歴: 失敗したタスクを追跡し、実行後に FAILED_SCREENSHOTS.md に出力する機能を追加。

import asyncio
import os
import re
import sys
from pathlib import Path
import shutil
import tempfile

from browser_use import Agent, Browser, BrowserSession, ChatGoogle, Controller
from browser_use.agent.views import AgentSettings
from dotenv import load_dotenv
from PIL import Image
import io
import base64

# -- config --
# 実行に必要な定数および環境変数の定義。
# BASE_DIR: プロジェクトのルートディレクトリ。
# OUTPUT_DIR: スクリーンショットの保存先パス。
# SESSION_DIR: ブラウザのプロファイル（ログイン情報等）を永続化するためのストレージパス。

BASE_DIR = Path(__file__).parent.parent
load_dotenv(Path(__file__).parent / ".env")

GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY")
PLAN_FILENAME  = os.getenv("PLAN_FILENAME", "REF_SCREENSHOT_PLAN.md")
BASE_URL       = os.getenv("BASE_URL", "https://stg.dh74sua11za2r.amplifyapp.com")
OUTPUT_DIR     = BASE_DIR / "frontend" / "public" / "images" / "manual" / "auto_screenshots"
SESSION_DIR    = Path(__file__).parent / ".browser_profile"
ERROR_LOG_PATH = Path(__file__).parent / "FAILED_SCREENSHOTS.md"
CONCURRENCY_LIMIT = 6 # 同時に実行するブラウザの数。システム負荷に応じて調整。

# -- states --
# アプリケーション内の状態を模倣するためのテスト用データセット。
# 画面遷移時のURLパスや目的（desc）に含まれるプレースホルダー（例: [qr_id_pin]）をこれらの実値で置換する。

STATES = {
    "qr_id_pin": "TEST-QR-PIN",
    "qr_id_active": "TEST-QR-ACTIVE",
    "qr_id_used": "TEST-QR-USED",
    "qr_id_shipped": "TEST-QR-SHIPPED",
    "qr_id_completed": "TEST-QR-COMPLETED",
    "qr_id_expired": "TEST-QR-EXPIRED",
    "qr_id_ban": "TEST-QR-BAN",
    "shopId": "test-shop-001",
    "product_id": "test-prod-001",
    "order_id_open": "ORD-001"
}

controller = Controller()

@controller.action(description="Save full page screenshot as WebP format. Argument: filename")
# 関数名: save_full_page_webp
# 役割: 表示中のページ全体（フルページ）を WebP 形式で保存するカスタムアクション。
# 引数: 
#   - filename: 保存するファイル名（拡張子含む）。
#   - browser_session: browser-use のブラウザセッションオブジェクト。
# 戻り値: 成功または失敗を示すメッセージ文字列。
# 特徴: チャンクスクロールによる Lazy Load 対策、ビューポートの一時拡張、CDP経由のキャプチャを統合。

async def save_full_page_webp(filename: str, browser_session: BrowserSession):
    """Wait for stability and capture the FULL page using persistent profile context."""
    print(f"🎬 Starting persistent capture for {filename}...")
    try:
        page = await browser_session.get_current_page()
        
        # 1. Wait for stability (Playwright's wait_for_load_state is unavailable in CDP)
        await asyncio.sleep(4)
        
        # 2. Robust chunked scrolling for Lazy Loading
        total_height = int(float(await page.evaluate("() => document.body.scrollHeight")))
        viewport_height = int(float(await page.evaluate("() => window.innerHeight")))
        viewport_width = int(float(await page.evaluate("() => window.innerWidth")))
        
        print(f"  📏 Detected Height: {total_height}px")
        
        current_scroll = 0
        while current_scroll < total_height:
            current_scroll += viewport_height
            await page.evaluate(f"() => window.scrollTo(0, {current_scroll})")
            await asyncio.sleep(0.3)
            total_height = int(float(await page.evaluate("() => document.body.scrollHeight")))
            
        await asyncio.sleep(1.0) # Stability
        await page.evaluate("() => window.scrollTo(0, 0)") # Reset to top
        await asyncio.sleep(0.5)
        
        # Resize the browser window internally to simulate a full page screenshot
        await page.set_viewport_size(width=viewport_width, height=total_height)
        await asyncio.sleep(1.0)
        
        # 3. Take screenshot via CDP (returns base64 string)
        base64_str = await page.screenshot(format='webp', quality=90)
        import base64
        img_bytes = base64.b64decode(base64_str)
        
        # 🧠 ASYNC: Move CPU-intensive image processing to a background thread
        def save_image_thread():
            img = Image.open(io.BytesIO(img_bytes))
            save_path = OUTPUT_DIR / filename
            save_path.parent.mkdir(parents=True, exist_ok=True)
            img.save(str(save_path), "WEBP", quality=90)
            return img.width, img.height

        width, height = await asyncio.to_thread(save_image_thread)
        
        # Reset viewport
        await page.set_viewport_size(width=viewport_width, height=viewport_height)
        
        print(f"  ✅ Saved: {filename} ({width}x{height})")
        return f"SUCCESS: Full page ({width}x{height}) saved to {filename}"
        
    except Exception as e:
        print(f"  ❌ Error in tool: {e}")
        import traceback
        traceback.print_exc()
        return f"ERROR: {str(e)}"

# 関数名: get_tasks
# 役割: 外部の計画書（Markdown）から実行すべきタスクの一覧を解析・抽出する。
# 引数: なし（内部で PLAN_FILENAME を使用）。
# 戻り値: タスク辞書（url, desc, file）のリスト。
# 処理概要: <!-- STEPS_START --> と <!-- STEPS_END --> の間のテーブルを解析し、プレースホルダーを STATES の実値で置換。
def get_tasks():

    plan_path = BASE_DIR / "documents" / PLAN_FILENAME
    if not plan_path.exists(): return []
    content = plan_path.read_text(encoding="utf-8")
    match = re.search(r'<!-- STEPS_START -->(.*?)<!-- STEPS_END -->', content, re.DOTALL)
    table = match.group(1) if match else content
    tasks = []
    for line in table.splitlines():
        line = line.strip()
        if not line or line.startswith(("#", "＃", "| Path")) or "---" in line: continue
        parts = [p.strip() for p in line.split("|") if p.strip()]
        if len(parts) >= 3:
            path, desc, file = parts[0], parts[1], parts[2]
            # 🧹 NORMALIZE: Strip backticks and whitespace from filenames
            file = file.replace('`', '').strip()
            
            for k, v in STATES.items():
                path = path.replace(f"[{k}]", v)
                desc = desc.replace(f"[{k}]", v)
                file = file.replace(f"[{k}]", v)
            tasks.append({
                "path": path,
                "url": f"{BASE_URL}{path}" if path != "[All]" else None,
                "desc": desc,
                "file": file
            })
    return tasks

# 関数名: run_isolated_task
# 役割: ブラウザインスタンスを個別に起動して特定のタスクを実行するラッパー。
# 引数:
#   - llm: 使用する LLM モデルのインスタンス。
#   - task_prompt: エージェントに与える具体的な指示文（MISSION）。
#   - use_tools: コントローラー（カスタムツール）を有効にするかどうかのフラグ。
# 戻り値: なし。
# 安定化制御: `use_thinking=False` を設定することで、JSONパースエラー等の不安定な挙動を抑制している。
async def run_isolated_task(llm, task_prompt, use_tools=False, profile_dir=None, headless=True):

    """Run an agent with a fresh browser instance for clean isolation."""
    target_profile = profile_dir if profile_dir else str(SESSION_DIR)
    browser = Browser(headless=headless, user_data_dir=target_profile)
    
    try:
        # 🧠 STABILIZATION: Disable thinking to avoid long-output JSON errors
        settings = AgentSettings(use_thinking=False)
        agent = Agent(
            task=task_prompt,
            llm=llm,
            browser=browser,
            controller=controller if use_tools else None,
            settings=settings
        )
        await agent.run(max_steps=15) # Increased steps for safety
    finally:
        if hasattr(browser, 'close'):
            await browser.close()
        elif hasattr(browser, 'stop'):
            await browser.stop()

# 関数名: main
# 役割: スクリプト全体のメインエントリポイント。2フェーズ構成（ログイン & 順次キャプチャ）で実行を制御する。
# 処理フロー: 
#   1. ログインフェーズ: /user ページで認証を行い、.browser_profile にセッションを保存。
#   2. 撮影フェーズ: get_tasks で取得した各タスクを順次実行し、スクリーンショットを保存・検証。
async def main():

    tasks = get_tasks()
    if not tasks:
        print("❌ No tasks found.")
        return

    failed_tasks = [] # 失敗したタスクをリストアップするための配列

    # 🚀 UPGRADE: Use stable model identifier confirmed by ListModels
    llm = ChatGoogle(model="gemini-flash-lite-latest", api_key=GEMINI_API_KEY, temperature=0, max_retries=5)

    # Phase 1: Ensure Login State (Persistent Profile)
    print("\n🔑 PHASE: Initialization/Login (Persistent Context)")
    login_prompt = (
        f"Go to {BASE_URL}/user. If not logged in, please log in with any credentials. "
        f"Confirm the dashboard is visible. The login state will be saved to the persistent profile."
    )
    await run_isolated_task(llm, login_prompt)

    # Phase 2: Concurrent Captures (Clean Isolation Model)
    # 🚀 OPTIMIZATION: Fresh browser per task, Headless=True, Async I/O for profile cloning.
    print(f"\n🚀 PHASE: Parallel Captures with {CONCURRENCY_LIMIT} independent browsers (Headless)")
    semaphore = asyncio.Semaphore(CONCURRENCY_LIMIT)

    async def worker(task_item, index):
        async with semaphore:
            start_time = asyncio.get_event_loop().time()
            print(f"\n📸 TASK [{index+1}/{len(tasks)}]: {task_item['file']} (Starting...)")
            
            prompt = (
                f"MISSION:\n"
                f"1. Navigate to: {task_item['url'] if task_item['url'] else 'Current page'}\n"
                f"2. Goal: {task_item['desc']}\n"
                f"3. ACTION: Call `save_full_page_webp(filename='{task_item['file']}')` once the goal is reached.\n"
                f"4. DONE: Successful tool call is mandatory.\n\n"
                f"CRITICAL RULES:\n"
                f"- DO NOT THINK TOO MUCH. Keep your thoughts extremely brief.\n"
                f"- FORBIDDEN TOOLS: You MUST use ONLY the custom `save_full_page_webp` tool.\n"
            )

            # プロファイルの衝突を避けるため、各タスク用に一時的なプロファイルディレクトリを作成
            with tempfile.TemporaryDirectory(prefix="browser_profile_worker_") as tmp_dir:
                # 🧠 ASYNC: Clone profile in a background thread to keep the loop moving
                if SESSION_DIR.exists():
                    await asyncio.to_thread(shutil.copytree, SESSION_DIR, tmp_dir, dirs_exist_ok=True)
                
                try:
                    await run_isolated_task(llm, prompt, use_tools=True, profile_dir=tmp_dir, headless=True)
                    
                    # Post-task verification
                    expected_file = OUTPUT_DIR / task_item['file']
                    duration = asyncio.get_event_loop().time() - start_time
                    if expected_file.exists():
                        print(f"  --> VERIFIED: {task_item['file']} (Took {duration:.1f}s)")
                    else:
                        error_msg = f"File not created: {task_item['file']}"
                        print(f"  --> WARNING: {error_msg}!")
                        failed_tasks.append({**task_item, "reason": error_msg})
                        
                except Exception as e:
                    error_msg = f"Task execution error: {str(e)}"
                    print(f"⚠️ {error_msg}")
                    failed_tasks.append({**task_item, "reason": error_msg})

    # Start all tasks in parallel
    await asyncio.gather(*(worker(task, i) for i, task in enumerate(tasks)))

    # -- Report Generation --
    # 実行結果のサマリーを表示し、失敗があればファイルに出力する。
    print(f"\n✨ EXECUTION FINISHED: {len(tasks) - len(failed_tasks)}/{len(tasks)} succeeded.")
    
    if failed_tasks:
        print(f"⚠️ {len(failed_tasks)} tasks failed. Generating report: {ERROR_LOG_PATH.name}")
        report = [
            "# Failed Screenshot Tasks Report",
            f"\nGenerated at: {os.popen('date').read().strip()}",
            "\n| Path | Navigation & Capture Instruction (LLM Prompt) | Target Filename | Reason |",
            "| :--- | :--- | :--- | :--- |"
        ]
        for ft in failed_tasks:
            report.append(f"| {ft['path']} | {ft['desc']} | {ft['file']} | {ft['reason']} |")
        
        ERROR_LOG_PATH.write_text("\n".join(report), encoding="utf-8")
    else:
        # 全件成功した場合は古いエラーログを削除（存在すれば）
        if ERROR_LOG_PATH.exists():
            ERROR_LOG_PATH.unlink()
        print("✅ All tasks completed successfully.")

if __name__ == "__main__":
    asyncio.run(main())