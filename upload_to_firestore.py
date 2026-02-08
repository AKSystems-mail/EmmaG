# Location: upload_to_firestore.py

import json
import firebase_admin
from firebase_admin import credentials, firestore

# --- CONFIGURATION ---
# Define the path to your service account key and the generated lesson file.
SERVICE_ACCOUNT_KEY_PATH = "service-account-key.json"
JSON_CONTENT_FILE_PATH = "math_level_110.json" # The file you generated earlier

# --- Define where to upload the content in Firestore ---
# You can change these to upload different lessons.
SUBJECT_ID = "math"
TOPIC_ID = "addition_single_digit"
# The script will get the level ID from the "difficulty" field in the JSON.


# --- THE SCRIPT ---

def upload_lesson():
    print("Initializing Firebase...")
    try:
        # Initialize the Firebase Admin SDK
        cred = credentials.Certificate(SERVICE_ACCOUNT_KEY_PATH)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        print("✅ Firebase initialized successfully.")
    except Exception as e:
        print(f"❌ Error initializing Firebase: {e}")
        print("Please ensure your 'service-account-key.json' file is in the correct path and is valid.")
        return

    print(f"\nReading content from '{JSON_CONTENT_FILE_PATH}'...")
    try:
        # Read the lesson data from the JSON file
        with open(JSON_CONTENT_FILE_PATH, 'r') as f:
            lesson_data = json.load(f)
        
        # Get the level ID from the difficulty code (e.g., 101 -> "1")
        # This is a simple way to handle it for now.
        level_id = str(lesson_data.get('difficulty', '101') % 100)

        print(f"✅ Read data for Level {level_id}.")
    except FileNotFoundError:
        print(f"❌ Error: The file '{JSON_CONTENT_FILE_PATH}' was not found.")
        return
    except json.JSONDecodeError:
        print(f"❌ Error: The file '{JSON_CONTENT_FILE_PATH}' is not a valid JSON file.")
        return

    print(f"\nPreparing to upload to Firestore path:")
    firestore_path = f"subjects/{SUBJECT_ID}/topics/{TOPIC_ID}/levels/{level_id}"
    print(f"'{firestore_path}'")

    try:
        # Get a reference to the document and set the data
        doc_ref = db.collection('subjects').document(SUBJECT_ID) \
                    .collection('topics').document(TOPIC_ID) \
                    .collection('levels').document(level_id)
        
        doc_ref.set(lesson_data)

        print("\n✅✅✅ Successfully uploaded lesson to Firestore!")

    except Exception as e:
        print(f"\n❌ An error occurred while uploading to Firestore: {e}")

# Run the main function
if __name__ == "__main__":
    upload_lesson()