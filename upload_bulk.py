# Location: upload_bulk.py

import os
import json
import time
import firebase_admin
from firebase_admin import credentials, firestore

# --- CONFIGURATION ---
SERVICE_ACCOUNT_KEY_PATH = "service-account-key.json"
# This is the main folder where all your generated subjects are.
BASE_CONTENT_DIR = "generated_content" 

# --- THE SCRIPT ---

def upload_all_content():
    """Scans the base directory and uploads all found lessons to Firestore."""
    
    print("Initializing Firebase...")
    try:
        cred = credentials.Certificate(SERVICE_ACCOUNT_KEY_PATH)
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred)
        db = firestore.client()
        print("✅ Firebase initialized successfully.")
    except Exception as e:
        print(f"❌ Error initializing Firebase: {e}")
        return

    # Initialize a batch write operation
    batch = db.batch()
    commit_count = 0
    total_files_processed = 0

    print(f"\nScanning for content in '{BASE_CONTENT_DIR}'...")

    # os.walk is a powerful tool to go through all folders and subfolders.
    for root, dirs, files in os.walk(BASE_CONTENT_DIR):
        for filename in files:
            # We only care about the JSON files.
            if filename.endswith('.json'):
                filepath = os.path.join(root, filename)
                
                try:
                    # --- Parse the path to get subject, topic, and level ---
                    # The path will look like: generated_content/math/addition_single_digit
                    path_parts = os.path.normpath(root).split(os.sep)
                    
                    # Expecting at least 3 parts: base_dir, subject, topic
                    if len(path_parts) < 3:
                        print(f"⚠️ Skipping file in unexpected directory: {filepath}")
                        continue

                    subject_id = path_parts[-2] # e.g., 'math'
                    topic_id = path_parts[-1]   # e.g., 'addition_single_digit'
                    
                    # Get level_id from filename like 'level_1.json'
                    level_id = filename.split('_')[1].split('.')[0]

                    # --- Read the lesson data from the file ---
                    with open(filepath, 'r') as f:
                        lesson_data = json.load(f)

                    # --- Add the upload operation to our batch ---
                    doc_ref = db.collection('subjects').document(subject_id) \
                                .collection('topics').document(topic_id) \
                                .collection('levels').document(level_id)
                    
                    batch.set(doc_ref, lesson_data)
                    commit_count += 1
                    total_files_processed += 1
                    print(f"  Queued for upload: {subject_id}/{topic_id}/level_{level_id}")

                    # Firestore batches have a 500 operation limit.
                    # We commit every 499 to be safe.
                    if commit_count >= 499:
                        print("\nCommitting batch of 499 operations...")
                        batch.commit()
                        print("✅ Batch committed.")
                        # Start a new batch
                        batch = db.batch()
                        commit_count = 0
                        time.sleep(1) # Pause briefly

                except Exception as e:
                    print(f"❌ Error processing file {filepath}: {e}")

    # After the loop, commit any remaining operations in the final batch.
    if commit_count > 0:
        print(f"\nCommitting final batch of {commit_count} operations...")
        batch.commit()
        print("✅ Final batch committed.")

    print(f"\n\n✅✅✅ Bulk upload complete! Processed {total_files_processed} files. ✅✅✅")


if __name__ == "__main__":
    upload_all_content()