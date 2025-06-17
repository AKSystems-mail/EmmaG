# Location: generate_content.py

import os
import json
import time
import google.generativeai as genai

# --- CONFIGURATION ---
API_KEY = "AIzaSyBn3v9SHVN0lvxWwg1tejgmfkpqAdsKVyk" 

READING_CURRICULUM = [
    # === Foundations ===
    ("Phonics: Short Vowel Sounds (a, e, i, o, u)", "phonics_short_vowels", 101),
    ("Basic Sight Words (the, a, is, you, to)", "sight_words_basic", 201),
    ("Understanding Sentences (Capital Letters and Periods)", "sentence_structure", 301),

    # === Building Blocks ===
    ("Word Families (e.g., -at, -an, -ip)", "word_families", 401),
    ("Identifying Nouns (Person, Place, or Thing)", "identifying_nouns", 501),
    ("Identifying Verbs (Action Words)", "identifying_verbs", 601),

    # === Comprehension and Advanced Skills ===
    ("Reading Comprehension (Answering 'Who, What, Where')", "reading_comprehension_basic", 701),
    ("Sequencing (First, Next, Last in a Story)", "story_sequencing", 801),
    ("Punctuation (Question Marks and Exclamation Points)", "punctuation_marks", 901),
    ("Finding the Main Idea", "main_idea", 1001),
]
# Add your READING_CURRICULUM, SCIENCE_CURRICULUM, etc. here

# --- THE SCRIPT ---

def generate_lesson_content(topic_name, subject, difficulty_code, level_number):
    """Generates content for a single lesson using the Gemini API."""
    
    prompt = f"""
    You are an expert curriculum developer and a fun, engaging 1st-grade teacher with a PhD in childhood education.
    Your task is to generate a lesson and a multiple-choice quiz for a specific level in an educational app.

    **Your Persona:**
    - Your tone is encouraging, gentle, and full of wonder.
    - You explain concepts by using simple, real-world analogies that a 6-year-old can relate to.
    - You avoid overly simplistic or repetitive phrasing. Each level should feel fresh.

    **Topic:** {topic_name}
    **Subject:** {subject}
    **Current Level:** {level_number} out of 10 
    **Difficulty Code:** {difficulty_code}

    **Instructions:**
    1.  **Lesson Text:** Write a simple, one or two-sentence explanation of the topic. Since this is level {level_number}/10, make the concept slightly more complex than a beginner level, but not overly difficult. Start with a relatable example.
    2.  **Quiz:** Create ONE multiple-choice quiz question that directly tests the concept from the lesson text.
    3.  **JSON Output:** Provide the output as a single, raw JSON object with NO explanatory text or markdown.

    **JSON Schema:**
    - "lessonText": (String) The lesson text you wrote.
    - "difficulty": (Number) The difficulty code I provided.
    - "quiz": (Array of 1 Map Object)
        - "question": (String) The quiz question.
        - "options": (Array of 4 Strings) The answer choices. Ensure one is clearly correct and the others are plausible but incorrect "distractors."
        - "correctAnswer": (String) The correct answer, which must exactly match one of the options.
    """
    
    # +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    # THE FIX: This entire block is now correctly indented to be
    #          part of the generate_lesson_content function.
    # +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    model = genai.GenerativeModel('gemini-1.5-pro')
    response = model.generate_content(prompt)
    
    cleaned_response_text = response.text.strip().replace("```json", "").replace("```", "")
    return json.loads(cleaned_response_text)


def main():
    """Main function to generate all content for the defined curriculum."""
    genai.configure(api_key=API_KEY)
    
    current_curriculum = READING_CURRICULUM # Change this to select other curriculums
    current_subject_name = "Reading"       # Make sure this matches the curriculum
    
    print(f"Starting content generation for the {current_subject_name} curriculum...")
    
    for topic_name, topic_id, start_difficulty in current_curriculum:
        print(f"\n--- Generating Topic: {topic_name} ---")
        
        output_dir = os.path.join("generated_content", current_subject_name.lower(), topic_id)
        os.makedirs(output_dir, exist_ok=True)
        
        for i in range(10): # Generate 10 levels
            level_number = i + 1
            difficulty_code = start_difficulty + i
            
            print(f"  Generating Level {level_number} (Difficulty: {difficulty_code})...")
            
            try:
                lesson_data = generate_lesson_content(topic_name, current_subject_name, difficulty_code, level_number) 
                
                filename = f"level_{level_number}.json"
                filepath = os.path.join(output_dir, filename)
                
                with open(filepath, 'w') as f:
                    json.dump(lesson_data, f, indent=2)
                
                print(f"  ✅ Successfully saved to '{filepath}'")
                
            except Exception as e:
                print(f"  ❌ An error occurred for Level {level_number}: {e}")
            
            time.sleep(2) # Respect API rate limits

    print("\n\n✅✅✅ All content generation complete! ✅✅✅")


if __name__ == "__main__":
    main()