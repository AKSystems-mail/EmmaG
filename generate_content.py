# Location: generate_content.py

import os
import json
import google.generativeai as genai

# --- CONFIGURATION ---
API_KEY = "AIzaSyBn3v9SHVN0lvxWwg1tejgmfkpqAdsKVyk" # Make sure your key is still here

# --- Define the lesson you want to create ---
lesson_topic = "Single-Digit Addition"
lesson_subject = "Math"
lesson_difficulty_code = 101


# --- THE SCRIPT ---

genai.configure(api_key=API_KEY)
model = genai.GenerativeModel('gemini-1.5-flash')

# +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
# THE UPGRADED PROMPT: This is the only part of the script that changes.
# +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
prompt = f"""
You are an expert curriculum developer and a fun, engaging 1st-grade teacher.
Your task is to generate a lesson and a short, multiple-choice quiz for an educational app.

Topic: {lesson_topic}
Subject: {lesson_subject}
Difficulty Level Code: {lesson_difficulty_code}

Please generate content based on this topic.

Provide the output as a single, raw JSON object with NO explanatory text,
markdown formatting, or anything else before or after it.

The JSON object must have the following keys:
- "lessonText": A string containing a simple, one or two-sentence explanation of the topic.
- "difficulty": A number representing the difficulty code.
- "quiz": An array of ONE map object. This map object must have the following three keys:
    - "question": A string for the multiple-choice question.
    - "options": An array of exactly four strings representing the answer choices. Three should be incorrect, one should be correct.
    - "correctAnswer": A string that EXACTLY matches one of the strings in the "options" array.
"""

print("Generating content for your lesson...")

try:
    response = model.generate_content(prompt)
    cleaned_response_text = response.text.strip().replace("```json", "").replace("```", "")
    lesson_data = json.loads(cleaned_response_text)

    print("\n✅ Success! Generated JSON data:")
    print(json.dumps(lesson_data, indent=2))

    filename = f"{lesson_subject.lower()}_level_{lesson_difficulty_code}.json"
    with open(filename, 'w') as f:
        json.dump(lesson_data, f, indent=2)
    
    print(f"\n✅ Successfully saved content to '{filename}'")

except json.JSONDecodeError:
    print("\n❌ Error: Failed to decode the AI's response into JSON.")
    print("Here is the raw response we received:")
    print(response.text)
except Exception as e:
    print(f"\n❌ An unexpected error occurred: {e}")