import asyncio
import os
import json
from playwright.async_api import async_playwright

# Configuration: Update these with your local environment settings
BASE_URL = "http://localhost:3000"
IMAGES_DIR = "frontend/public/images/manual"
# JSON file derived from MANUAL_SCREENSHOT_INSTRUCTIONS.md (mocked here for the script)
SCREENSHOT_TASKS = [
    # User Portal
    {"path": "user_profile_edit.webp", "url": "/user/editprofile", "viewport": {"width": 1280, "height": 800}},
    {"path": "user_history_list.webp", "url": "/user/sentmemory", "viewport": {"width": 1280, "height": 800}},
    {"path": "user_delivery_settings.webp", "url": "/user/editdelivery", "viewport": {"width": 1280, "height": 800}},
    
    # Shop Admin (example - needs specific shop ID)
    {"path": "shopadmin-activate.webp", "url": "/shop/{shopId}", "actions": ["click:text=アクティベーション"], "viewport": {"width": 1280, "height": 1000}},
    
    # System Admin
    {"path": "admin-dashboard.webp", "url": "/admin", "viewport": {"width": 1440, "height": 900}},
    {"path": "admin-shops.webp", "url": "/admin", "actions": ["click:text=ショップ管理"], "viewport": {"width": 1440, "height": 900}},
]

async def capture_screenshots():
    os.makedirs(IMAGES_DIR, exist_ok=True)
    
    async with async_playwright() as p:
        # Using a persistent context might be useful if the user is already logged in on their machine,
        # but for clean automation we usually start fresh.
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()

        print(f"Starting screenshot capture at {BASE_URL}...")

        # NOTE: Implement Login Flow here if session is not active
        # await page.goto(f"{BASE_URL}/login")
        # await page.fill('input[type="email"]', "YOUR_EMAIL")
        # await page.fill('input[type="password"]', "YOUR_PASSWORD")
        # await page.click('button:has-text("ログイン")')
        # await page.wait_for_url("**/user")

        for task in SCREENSHOT_TASKS:
            # Handle dynamic placeholders
            url = task["url"].replace("{shopId}", "DEMO_SHOP_ID") # Update with real ID
            
            print(f"Capturing {task['path']} from {url}...")
            await page.set_viewport_size(task.get("viewport", {"width": 1280, "height": 800}))
            await page.goto(f"{BASE_URL}{url}")
            await page.wait_for_load_state("networkidle")

            # Execute interaction steps
            if "actions" in task:
                for action in task["actions"]:
                    if action.startswith("click:"):
                        selector = action.replace("click:", "")
                        await page.click(selector)
                        await page.wait_for_timeout(500) # Small wait for UI animations

            # Capture and save
            save_path = os.path.join(IMAGES_DIR, task["path"])
            await page.screenshot(path=save_path)
            print(f"Saved to {save_path}")

        await browser.close()

if __name__ == "__main__":
    # Ensure playwright browsers are installed: playwright install chromium
    asyncio.run(capture_screenshots())
