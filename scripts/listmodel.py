from google import genai
from dotenv import load_dotenv
import os
from pathlib import Path

# -- config --
BASE_DIR = Path(__file__).parent.parent
load_dotenv(Path(__file__).parent / ".env")

print(os.getenv("GOOGLE_API_KEY"))
client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

print("List of models that support generateContent:\n")
for m in client.models.list():
    for action in m.supported_actions:
        if action == "generateContent":
            print(m.name)

print("List of models that support embedContent:\n")
for m in client.models.list():
    for action in m.supported_actions:
        if action == "embedContent":
            print(m.name)