# Location: upload_bonus_challenges.py

import os
import json
import time
import firebase_admin
from firebase_admin import credentials, firestore

# --- CONFIGURATION ---
SERVICE_ACCOUNT_KEY_PATH = "service-account-key.json"
BASE_BONUS_DIR = "generated_bonus_content" 

# --- THE SCRIPT ---

def upload_all_bonus_challenges():
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

    batch = db.batch()
    commit_count = 0
    total_files_processed = 0

    print(f"\nScanning for content in '{BASE_BONUS_DIR}'...")

    for filename in os.listdir(BASE_BONUS_DIR):
        if filename.endswith('.json'):
            filepath = os.path.join(BASE_BONUS_DIR, filename)
            
            try:
                # The document ID in Firestore will be like "challenge_1", "challenge_2"
                doc_id = filename.split('.')[0] 

                with open(filepath, 'r') as f:
                    challenge_data = json.load(f)
                
                doc_ref = db.collection('bonus_level').document(doc_id)
                batch.set(doc_ref, challenge_data)
                commit_count += 1
                total_files_processed += 1
                print(f"  Queued for upload: {doc_id}")

                if commit_count >= 499:
                    print("\nCommitting batch...")
                    batch.commit()
                    batch = db.batch() # Start a new batch
                    commit_count = 0
                    time.sleep(1)

            except Exception as e:
                print(f"❌ Error processing file {filepath}: {e}")

    if commit_count > 0:
        print(f"\nCommitting final batch of {commit_count} operations...")
        batch.commit()

    print(f"\n\n✅✅✅ Bonus challenge upload complete! Processed {total_files_processed} files. ✅✅✅")

if __name__ == "__main__":
    upload_all_bonus_challenges()