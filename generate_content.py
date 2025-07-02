# Location: generate_content.py

import os
import json
import time
import google.generativeai as genai

# --- CONFIGURATION ---
API_KEY = "AIzaSyBn3v9SHVN0lvxWwg1tejgmfkpqAdsKVyk" 

SCIENCE_CURRICULUM = [
    # === Life Science ===
    ("Living and Non-Living Things", "living_nonliving", 101),
    ("Parts of a Plant", "plant_parts", 201),
    ("Animal Types (Mammals, Birds, Fish)", "animal_types", 301),
    ("The Five Senses", "five_senses", 401),

    # === Earth Science ===
    ("Types of Weather (Sunny, Rainy, Cloudy)", "weather_types", 501),
    ("The Four Seasons", "four_seasons", 601),
    ("Land, Water, and Air", "land_water_air", 701),

    # === Physical Science ===
    ("States of Matter (Solid, Liquid, Gas)", "states_of_matter", 801),
    ("Pushes and Pulls (Basic Forces)", "pushes_pulls", 901),

    # === Space Science ===
    ("The Sun, Earth, and Moon", "sun_earth_moon", 1001),
]
# Add your READING_CURRICULUM, SCIENCE_CURRICULUM, etc. here

# --- THE SCRIPT ---

    prompt = f"""
    You are an expert curriculum developer and a fun, engaging 1st-grade teacher with a PhD in childhood education.
    Your task is to generate a lesson and a multiple-choice quiz for a specific level in an educational app.

    **Your Persona:**
    - Your tone is encouraging, gentle, and full of wonder.
    - You explain concepts by using simple, real-world analogies that a 6-year-old can relate to.
    - You avoid overly simplistic or repetitive phrasing. Each level should feel fresh and unique.

    **Topic:** {topic_name}
    **Subject:** {subject}
    **Current Level:** {level_number} out of 10 
    **Difficulty Code:** {difficulty_code}

    **CRITICAL RULES FOR THIS TASK:**
    1.  **Analogy Variety:** You MUST use a completely different real-world analogy or scenario for each level. For example, if the topic is addition, do not use "apples" or "bouncy balls" multiple times. Use scenarios involving building blocks, animal friends, cookies, stickers, etc.
    2.  **Phrasing Variety:** You MUST avoid starting every lesson with "Imagine you have...". Use different sentence structures to introduce the concept. For example: "What happens when...", "Let's think about...", "Counting is fun! If...".
    3.  **Difficulty Scaling:** The lesson text and quiz question for level {level_number} MUST be slightly more complex or introduce a new element compared to the previous level. For example, for addition, early levels might be 1+1, while later levels could be 4+5.

    **Instructions:**
    1.  **Lesson Text:** Write a simple, one or two-sentence explanation of the topic, following all the rules above.
    2.  **Quiz:** Create ONE multiple-choice quiz question that directly tests the concept from the lesson text.
    3.  **JSON Output:** Provide the output as a single, raw JSON object with NO explanatory text or markdown.

    **JSON Schema:**
    - "lessonText": (String) The lesson text you wrote.
    - "difficulty": (Number) The difficulty code I provided.
    - "quiz": (Array of 1 Map Object)
        - "question": (String) The quiz question.
        - "options": (Array of 4 Strings) The answer choices.
        - "correctAnswer": (String) The correct answer, which must exactly match one of the options.
    - "suggestedQuestions": (Array of 2-3 Strings) Simple, relevant questions a child might ask about this lesson text.
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
    
    current_curriculum = SCIENCE_CURRICULUM # Change this to select other curriculums
    current_subject_name = "Science"       # Make sure this matches the curriculum
    
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
