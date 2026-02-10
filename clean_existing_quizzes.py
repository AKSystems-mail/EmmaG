import os
import json
import re

BASE_DIR = "generated_content"

def clean_quiz_options(lesson_data):
    """
    Removes prefixes like 'A.', 'B)', 'C ', 'D.' from quiz options and correct answers.
    Returns True if changes were made, False otherwise.
    """
    changed = False
    if 'quiz' in lesson_data:
        for question in lesson_data['quiz']:
            if 'options' in question:
                cleaned_options = []
                for opt in question['options']:
                    # Regex to match "A.", "A)", "A " at the start, case insensitive
                    # strict check for single letter A-F followed by punctuation or space
                    cleaned_opt = re.sub(r'^[A-F][\.\)\:\-\s]+\s*', '', opt, flags=re.IGNORECASE)
                    if cleaned_opt != opt:
                        changed = True
                    cleaned_options.append(cleaned_opt)
                question['options'] = cleaned_options
            
            if 'correctAnswer' in question:
                orig_answer = question['correctAnswer']
                # Clean the correct answer string itself
                cleaned_answer = re.sub(r'^[A-F][\.\)\:\-\s]+\s*', '', orig_answer, flags=re.IGNORECASE)
                
                # Also check if correct answer was just the letter "A" or "B" and map it to the full text
                # (Some AIs just put "A" as the correct answer)
                if len(cleaned_answer) <= 1 and 'options' in question:
                     # This logic is risky if the answer is actually "A" (word), but for quizzes it's usually an index.
                     # Let's stick to just stripping the prefix for now to be safe.
                     pass

                if cleaned_answer != orig_answer:
                    question['correctAnswer'] = cleaned_answer
                    changed = True
    return changed

def process_all_files():
    total_cleaned = 0
    for root, dirs, files in os.walk(BASE_DIR):
        for filename in files:
            if filename.endswith(".json"):
                filepath = os.path.join(root, filename)
                try:
                    with open(filepath, 'r') as f:
                        data = json.load(f)
                    
                    if clean_quiz_options(data):
                        print(f"🧹 Cleaning quiz in: {filepath}")
                        with open(filepath, 'w') as f:
                            json.dump(data, f, indent=2)
                        total_cleaned += 1
                except Exception as e:
                    print(f"❌ Error reading {filepath}: {e}")

    print(f"\n✅ Cleaned {total_cleaned} files.")

if __name__ == "__main__":
    process_all_files()
