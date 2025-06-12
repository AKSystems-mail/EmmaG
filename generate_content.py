# Location: generate_content.py

import os
import json
import google.generativeai as genai

# --- CONFIGURATION ---
# IMPORTANT: Replace "YOUR_API_KEY_HERE" with the key you got from Google AI Studio.
# For better security, it's best to set this as an environment variable,
# but for this script, pasting it directly is fine.
API_KEY = "AIzaSyBn3v9SHVN0lvxWwg1tejgmfkpqAdsKVyk"

# --- Define the lesson you want to create ---
# You can change these values to generate any lesson you want!
lesson_topic = "Identifying Nouns (Person, Place, Thing)"
lesson_subject = "Reading"
lesson_difficulty_code = 101


# --- THE SCRIPT ---

# Configure the generative AI model
genai.configure(api_key=API_KEY)
model = genai.GenerativeModel('gemini-1.5-flash')

# This is the magic prompt. It tells the AI exactly what to do.
prompt = f"""
You are an expert curriculum developer and a fun, engaging 1st-grade teacher.
Your task is to generate a lesson and a short quiz for an educational app.

Topic: {lesson_topic}
Subject: {lesson_subject}
Difficulty Level Code: {lesson_difficulty_code}

Please generate content based on this topic.

Provide the output as a single, raw JSON object with NO explanatory text,
markdown formatting, or anything else before or after it.

The JSON object must have the following keys:
- "lessonText": A string containing a simple, one or two-sentence explanation of the topic, suitable for a 6-year-old.
- "difficulty": A number representing the difficulty code. Use the code I provided.
- "quiz": An array of exactly two map objects. Each map object must have two keys: "question" (a string) and "answer" (a string). The questions should be simple and directly related to the lesson.
"""

print("Generating content for your lesson...")

try:
    # Send the prompt to the model
    response = model.generate_content(prompt)
    
    # The response from the AI is a text string that looks like JSON.
    # We need to parse it into a real JSON object.
    # We strip any potential markdown backticks and "json" text.
    cleaned_response_text = response.text.strip().replace("```json", "").replace("```", "")
    
    lesson_data = json.loads(cleaned_response_text)

    print("\n✅ Success! Generated JSON data:")
    # Pretty-print the JSON to the console
    print(json.dumps(lesson_data, indent=2))

    # Save the generated data to a file
    filename = f"{lesson_subject.lower()}_level_{lesson_difficulty_code}.json"
    with open(filename, 'w') as f:
        json.dump(lesson_data, f, indent=2)
    
    print(f"\n✅ Successfully saved content to '{filename}'")

except json.JSONDecodeError:
    print("\n❌ Error: Failed to decode the AI's response into JSON.")
    print("This usually happens if the AI includes text like 'Here is your JSON:'")
    print("Here is the raw response we received:")
    print(response.text)
except Exception as e:
    print(f"\n❌ An unexpected error occurred: {e}")