# Location: generate_bonus_challenges.py

import os
import json
import time
import random # To help pick subject combinations
import google.generativeai as genai

# --- CONFIGURATION ---
API_KEY = "AIzaSyBn3v9SHVN0lvxWwg1tejgmfkpqAdsKVyk" # Your Gemini API Key
TOTAL_CHALLENGES = 50
CORE_SUBJECTS = ["Math", "Reading", "Science", "World"]

# --- THE SCRIPT ---

def generate_single_bonus_challenge(challenge_number, difficulty_score):
    """Generates content for a single bonus challenge using the Gemini API."""
    
    # Randomly pick two different subjects to integrate
    subject_1, subject_2 = random.sample(CORE_SUBJECTS, 2)

    prompt = f"""
    You are an expert STEM curriculum designer and a creative game developer for a 1st to 2nd-grade educational app.
    Your task is to generate a single, engaging STEM bonus challenge that integrates concepts from AT LEAST TWO different core subjects.

    Core Subjects Available: Math, Reading (Language Arts), Science, World (Social Studies).

    Instructions for this specific challenge:
    1.  Subject Integration: The challenge MUST clearly combine concepts from at least two of the core subjects listed above. Please primarily integrate concepts from {subject_1} and {subject_2}.
    2.  STEM Focus: The scenario or question should be rooted in Science, Technology, Engineering, or Math, or a real-world application of these.
    3.  Difficulty Level: This specific challenge is number {challenge_number} out of {TOTAL_CHALLENGES}, and should have a difficulty score of {difficulty_score} (where 1 is extremely easy 1st-grade, and {TOTAL_CHALLENGES} is early 2nd-grade, possibly requiring a couple of simple steps or slightly more abstract thinking). Adjust the complexity of the problem, vocabulary, and reasoning required accordingly.
    4.  Challenge Type: The challenge must be multiple-choice.
    5.  Output Format: Provide the output as a single, raw JSON object with NO explanatory text or markdown.

    JSON Schema:
    - "difficultyScore": {difficulty_score},
    - "subjectsInvolved": ["{subject_1}", "{subject_2}"],
    - "promptText": "(String) A short, engaging scenario or story (1-3 sentences) leading to a clear question.",
    - "challengeType": "multiple_choice",
    - "options": (Array of 4 Strings) Four answer choices. One must be clearly correct, the others plausible but incorrect "distractors" suitable for the age group.,
    - "correctAnswer": "(String) The correct answer, which must exactly match one of the strings in the "options" array.",
    - "explanationText": "(String, Optional) A brief, kid-friendly explanation (1 sentence) of why the correct answer is right. Only include if truly helpful."
    """
    
    model = genai.GenerativeModel('gemini-2.0-flash')
    response = model.generate_content(prompt)
    
    cleaned_response_text = response.text.strip().replace("```json", "").replace("```", "")
    return json.loads(cleaned_response_text)


def main():
    genai.configure(api_key=API_KEY)
    
    print("Starting Bonus Challenge generation...")
    
    output_base_dir = "generated_bonus_content"
    os.makedirs(output_base_dir, exist_ok=True)
    
    for i in range(TOTAL_CHALLENGES):
        challenge_number = i + 1
        # Simple linear difficulty scaling for this example.
        # You could make this more sophisticated if needed.
        difficulty_score = challenge_number 
        
        print(f"\n--- Generating Bonus Challenge {challenge_number}/{TOTAL_CHALLENGES} (Difficulty: {difficulty_score}) ---")
        
        try:
            challenge_data = generate_single_bonus_challenge(challenge_number, difficulty_score)
            
            # Ensure the generated data includes the difficultyScore from our loop
            challenge_data['difficultyScore'] = difficulty_score 
            
            filename = f"challenge_{challenge_number}.json"
            filepath = os.path.join(output_base_dir, filename)
            
            with open(filepath, 'w') as f:
                json.dump(challenge_data, f, indent=2)
            
            print(f"  ✅ Successfully saved to '{filepath}'")
            
        except Exception as e:
            print(f"  ❌ An error occurred for Challenge {challenge_number}: {e}")
            print(f"     Problematic prompt might have been: {generate_single_bonus_challenge.__doc__}") # Basic way to see part of it
        
        # Pause to respect API rate limits, especially for Pro models
        time.sleep(5) # Increased pause for Pro model

    print(f"\n\n✅✅✅ All {TOTAL_CHALLENGES} bonus challenges generated! ✅✅✅")


if __name__ == "__main__":
    main()