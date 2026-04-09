"""
screenshot_auto_capture.py
REF_SCREENSHOT_INSTRUCTIONS.md に基づいてスクリーンショットを自動撮影するスクリプト。

使い方:
  cd scripts
  source .venv/bin/activate
  python screenshot_auto_capture.py

事前準備:
  scripts/.env に以下を設定してください:
    GOOGLE_API_KEY=...
    LOGIN_EMAIL=test@example.com
    LOGIN_PASSWORD=yourpassword
"""
import asyncio
import os
import re
from pathlib import Path

from browser_use import Agent, Browser, BrowserProfile, ChatGoogle, Controller
from browser_use.browser import BrowserSession
from browser_use.agent.views import ActionResult
from dotenv import load_dotenv

# ── 0. 環境設定 ──────────────────────────────────────────────────────────────
# スクリプトの場所を基準にパスを解決
BASE_DIR = Path(__file__).parent.parent
load_dotenv(Path(__file__).parent / ".env")

# 必須: Gemini APIキー
api_key = os.getenv("GOOGLE_API_KEY")
# 必須: ログイン情報 (scripts/.env に設定してください)
login_email    = os.getenv("LOGIN_EMAIL", "")
login_password = os.getenv("LOGIN_PASSWORD", "")

if not api_key:
    raise RuntimeError("GOOGLE_API_KEY が未設定です。scripts/.env を確認してください。")
if not login_email or not login_password:
    print("WARNING: LOGIN_EMAIL / LOGIN_PASSWORD が未設定です。ログイン処理が失敗する可能性があります。")

# ── 1. 定数 ───────────────────────────────────────────────────────────────────
TASK_PATH      = BASE_DIR / "documents" / "REF_SCREENSHOT_INSTRUCTIONS.md"
BASE_URL       = os.getenv("BASE_URL", "http://localhost:3000")
SCREENSHOT_DIR = BASE_DIR / "public" / "images" / "manuals" / "auto_screenshots"
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

print(f"APIキーの読み込みに成功しました。")
print(f"スクリーンショット保存先: {SCREENSHOT_DIR}")

# ── 2. LLM ───────────────────────────────────────────────────────────────────
# browser-use 専用の ChatGoogle を使用 (langchain版は Pydantic 互換エラーが出る)
llm = ChatGoogle(
    model="gemini-2.0-flash",
    api_key=api_key
)

# ── 3. カスタムコントローラー ─────────────────────────────────────────────────
controller = Controller()

@controller.action(
    "現在の画面のスクリーンショットを指定されたファイルパスに保存する。"
    "引数 save_path には絶対パスを渡すこと。",
)
async def save_screenshot(save_path: str, browser_session: BrowserSession) -> ActionResult:
    """
    ブラウザの現在のビューポートをキャプチャして save_path に保存する。
    webp 形式で保存する。
    """
    out = Path(save_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    # take_screenshot は PNG バイト列を返す (format='png' がデフォルト)
    # .webp 形式で書き出したい場合は Pillow 経由で変換する
    png_bytes = await browser_session.take_screenshot(full_page=False, format="png")

    # PNG → WebP 変換
    import io
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(png_bytes))
        img.save(str(out), "WEBP", quality=90)
    except ImportError:
        # Pillow がなければ PNG のまま保存 (拡張子だけ .png にする)
        out = out.with_suffix(".png")
        out.write_bytes(png_bytes)

    msg = f"スクリーンショットを保存しました: {out}"
    print(f"📸 {msg}")
    return ActionResult(extracted_content=msg, long_term_memory=msg)

# ── 4. Markdownから手順を読み込む ──────────────────────────────────────────────
def parse_manual_template(file_path: Path) -> list[dict]:
    if not file_path.exists():
        raise FileNotFoundError(f"テンプレートが見つかりません: {file_path}")

    content = file_path.read_text(encoding="utf-8")

    # テーブル行 `| \`path.webp\` | \`/url\` | 手順 |` を抽出
    pattern = r'\| `(.+?\.webp)` \| `(.+?)` \| (.+?) \|'
    return [
        {"path": m[0], "url": m[1], "instruction": m[2]}
        for m in re.findall(pattern, content)
    ]

# ── 5. メイン処理 ─────────────────────────────────────────────────────────────
async def run_automation():
    tasks = parse_manual_template(TASK_PATH)
    if not tasks:
        print("実行すべきタスクが見つかりませんでした。テンプレートを確認してください。")
        return

    print(f"タスク数: {len(tasks)}")

    # ブラウザを一つ起動してセッションを使いまわす
    browser = Browser(
        browser_profile=BrowserProfile(headless=False)
    )

    # ── ログイン ────────────────────────────────────────────────────────────
    print("\nログイン処理を開始します...")
    login_agent = Agent(
        task=(
            f"{BASE_URL}/login にアクセスし、以下の認証情報でログインしてください。\n"
            # f"メールアドレス: {login_email}\n"
            # f"パスワード: {login_password}\n"
            f"Google認証のボタンで一番上にあるGoogleアカウントを選択してください"
            "ログイン後、ダッシュボードまたはマイページが表示されるのを確認してください。"
        ),
        llm=llm,
        browser=browser,
        controller=controller,
    )
    await login_agent.run()

    # ── 各ページのスクリーンショット撮影 ────────────────────────────────────
    for i, task in enumerate(tasks, 1):
        save_path = str(SCREENSHOT_DIR / task["path"])
        print(f"\n[{i}/{len(tasks)}] 撮影開始: {task['path']}")

        agent = Agent(
            task=(
                f"1. {BASE_URL}{task['url']} に移動してください。\n"
                f"2. {task['instruction']}\n"
                f"3. 準備ができたら `save_screenshot` アクションを呼び出し、"
                f"   save_path='{save_path}' でスクリーンショットを保存してください。"
            ),
            llm=llm,
            browser=browser,         # ← ログイン済みセッションを共有
            controller=controller,
        )
        await agent.run()

    await browser.stop()
    print("\n✅ 全タスク完了！")

if __name__ == "__main__":
    asyncio.run(run_automation())