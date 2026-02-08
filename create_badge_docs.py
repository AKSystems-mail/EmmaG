# Location: create_badge_docs.py

import firebase_admin
from firebase_admin import credentials, firestore

# --- CONFIGURATION ---
SERVICE_ACCOUNT_KEY_PATH = "service-account-key.json" # Or "service-account.json"
PLACEHOLDER_IMAGE_URL = "YOUR_PLACEHOLDER_IMAGE_URL_HERE" # e.g., a link to a generic question mark image

# Paste the ALL_BADGES_INFO list from above here
ALL_BADGES_INFO = [
    # === Math Badges ===
    {"doc_id": "addition_single_digit", "name": "Addition Ace"},
    {"doc_id": "subtraction_single_digit", "name": "Subtraction Star"},
    {"doc_id": "counting_to_100", "name": "Century Counter"},
    {"doc_id": "basic_shapes", "name": "Shape Shifter"},
    {"doc_id": "comparing_numbers", "name": "Number Navigator"},
    {"doc_id": "place_value_tens_ones", "name": "Place Value Pro"},
    {"doc_id": "basic_measurement", "name": "Measurement Master"},
    {"doc_id": "telling_time_hour_half", "name": "Time Teller"},
    {"doc_id": "intro_money_coins", "name": "Coin Collector"},
    {"doc_id": "addition_two_digit_no_regroup", "name": "Double Digit Dynamo"},
    # === Reading Badges ===
    {"doc_id": "phonics_short_vowels", "name": "Vowel Voyager"},
    {"doc_id": "sight_words_basic", "name": "Sight Word Sleuth"},
    {"doc_id": "sentence_structure", "name": "Sentence Superstar"},
    {"doc_id": "word_families", "name": "Word Family Wiz"},
    {"doc_id": "identifying_nouns", "name": "Noun Ninja"},
    {"doc_id": "identifying_verbs", "name": "Verb Virtuoso"},
    {"doc_id": "reading_comprehension_basic", "name": "Story Detective"},
    {"doc_id": "story_sequencing", "name": "Sequence Sorcerer"},
    {"doc_id": "punctuation_marks", "name": "Punctuation Powerhouse"},
    {"doc_id": "main_idea", "name": "Idea Illuminator"},
    # === Science Badges ===
    {"doc_id": "living_nonliving", "name": "Life Discoverer"},
    {"doc_id": "plant_parts", "name": "Plant Pro"},
    {"doc_id": "animal_types", "name": "Animal Expert"},
    {"doc_id": "five_senses", "name": "Sensational Scientist"},
    {"doc_id": "weather_types", "name": "Weather Watcher"},
    {"doc_id": "four_seasons", "name": "Season Cycler"},
    {"doc_id": "land_water_air", "name": "Earth Explorer"},
    {"doc_id": "states_of_matter", "name": "Matter Magician"},
    {"doc_id": "pushes_pulls", "name": "Force Finder"},
    {"doc_id": "sun_earth_moon", "name": "Cosmic Kid"},
    # === World (Social Studies) Badges ===
    {"doc_id": "families", "name": "Family Star"},
    {"doc_id": "community_helpers", "name": "Helper Hero"},
    {"doc_id": "rules_and_laws", "name": "Rule Respecter"},
    {"doc_id": "intro_to_maps", "name": "Map Marvel"},
    {"doc_id": "seven_continents", "name": "Continent Conqueror"},
    {"doc_id": "five_oceans", "name": "Ocean Explorer"},
    {"doc_id": "world_holidays", "name": "Holiday Hopper"},
    {"doc_id": "cultures_traditions", "name": "Culture Connector"},
    {"doc_id": "world_landmarks", "name": "Landmark Legend"},
    {"doc_id": "past_and_present", "name": "Time Traveler"},
    # === STEM Bonus Badge ===
    {"doc_id": "stem_bonus_complete", "name": "STEM Innovator"},
]


# --- THE SCRIPT ---

def create_badge_documents():
    print("Initializing Firebase...")
    try:
        cred = credentials.Certificate(SERVICE_ACCOUNT_KEY_PATH)
        if not firebase_admin._apps: # Check if already initialized
            firebase_admin.initialize_app(cred)
        db = firestore.client()
        print("✅ Firebase initialized successfully.")
    except Exception as e:
        print(f"❌ Error initializing Firebase: {e}")
        print(f"Please ensure your '{SERVICE_ACCOUNT_KEY_PATH}' file is in the correct path and is valid.")
        return

    batch = db.batch()
    created_count = 0

    print("\nCreating badge documents in Firestore...")

    for badge_info in ALL_BADGES_INFO:
        doc_id = badge_info["doc_id"]
        badge_name = badge_info["name"]
        
        # The data for the new badge document
        badge_data = {
            "name": badge_name,
            "topicId": doc_id, # Storing the topicId for consistency
            "imageUrl": PLACEHOLDER_IMAGE_URL 
        }
        
        doc_ref = db.collection('badges').document(doc_id)
        batch.set(doc_ref, badge_data)
        created_count += 1
        print(f"  Queued for creation: Badge '{badge_name}' (ID: {doc_id})")

        # Commit in batches of 499 to stay within Firestore limits
        if created_count % 499 == 0:
            print(f"\nCommitting batch of {created_count % 499 if created_count % 499 != 0 else 499} documents...")
            batch.commit()
            batch = db.batch() # Start a new batch
            print("✅ Batch committed.")
            
    # Commit any remaining documents in the final batch
    if created_count % 499 != 0:
        print(f"\nCommitting final batch of {created_count % 499} documents...")
        batch.commit()
        print("✅ Final batch committed.")

    print(f"\n\n✅✅✅ Successfully created {created_count} badge documents in Firestore! ✅✅✅")
    print("Remember to update the 'imageUrl' for each badge with the real URL from Firebase Storage.")


if __name__ == "__main__":
    create_badge_documents()