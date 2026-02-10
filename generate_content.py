import os
import json
import time
import glob
import warnings

# Suppress Python version warnings
warnings.filterwarnings("ignore", category=FutureWarning)

from google.genai import types as genai_types
from google import genai
import vertexai
from vertexai.preview.vision_models import ImageGenerationModel

# --- CONFIGURATION ---
API_KEY = "REDACTED" 
PROJECT_ID = "emma-g-adventures"
LOCATION = "us-central1"
SERVICE_ACCOUNT_KEY_PATH = "service-account-key.json"

# Set credentials for Vertex AI
if os.path.exists(SERVICE_ACCOUNT_KEY_PATH):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = SERVICE_ACCOUNT_KEY_PATH
    print(f"✅ Vertex AI Authenticated using {SERVICE_ACCOUNT_KEY_PATH}")

vertexai.init(project=PROJECT_ID, location=LOCATION)
imagen_model = ImageGenerationModel.from_pretrained("imagen-4.0-fast-generate-001")

# Initialize the Google GenAI client
client = genai.Client(api_key=API_KEY)

READING_CURRICULUM = [
    ("Basic Sight Words (the, a, is, you, to)", "sight_words_basic", 101),
    ("Identifying Nouns (Person, Place, or Thing)", "identifying_nouns", 201),
    ("Identifying Verbs (Action Words)", "identifying_verbs", 301),
    ("Phonics: Short Vowel Sounds (a, e, i, o, u)", "phonics_short_vowels", 401),
    ("Word Families (e.g., -at, -an, -ip)", "word_families", 501),
    ("Punctuation (Question Marks and Exclamation Points)", "punctuation_marks", 601),
    ("Understanding Sentences (Capital Letters and Periods)", "sentence_structure", 701),
    ("Reading Comprehension (Answering Questions)", "reading_comprehension_basic", 801),
    ("Main Idea (What is the story about?)", "main_idea", 901),
    ("Story Sequencing (First, Next, Last)", "story_sequencing", 1001),
]

import re

# ... existing imports ...

def clean_quiz_options(lesson_data):
    """
    Removes prefixes like 'A.', 'B)', 'C ', 'D.' from quiz options.
    """
    if 'quiz' in lesson_data:
        for question in lesson_data['quiz']:
            if 'options' in question:
                cleaned_options = []
                for opt in question['options']:
                    # Regex to match "A.", "A)", "A " at the start, case insensitive
                    cleaned_opt = re.sub(r'^[A-D][\.\)\s]+\s*', '', opt, flags=re.IGNORECASE)
                    cleaned_options.append(cleaned_opt)
                question['options'] = cleaned_options
            
            # Also clean the correct answer if it has the prefix
            if 'correctAnswer' in question:
                question['correctAnswer'] = re.sub(r'^[A-D][\.\)\s]+\s*', '', question['correctAnswer'], flags=re.IGNORECASE)
    return lesson_data

def generate_image_for_level(prompt: str, output_path: str):
    """
    Calls the Imagen 4 Fast API to generate an image and saves it locally.
    """
    print(f"    [🎨 GENERATING IMAGE] Prompt: {prompt[:50]}...")
    
    try:
        response = imagen_model.generate_images(
            prompt=prompt,
            number_of_images=1,
            language="en",
            aspect_ratio="1:1",
            safety_filter_level="block_few",
            person_generation="allow_adult"
        )
        
        if response.images and len(response.images) > 0:
            image = response.images[0]
            image.save(location=output_path, include_generation_parameters=False)
            print(f"    [💾 SAVED] To: {output_path}")
            return True
        else:
            print(f"    [⚠️ WARNING] No images returned from API.")
            return False
            
    except Exception as e:
        print(f"    [❌ ERROR] Image generation failed: {e}")
        return False

def find_existing_image(topic_id: str, level_number: int) -> str:
    """
    Finds the first existing image for a given level in the assets folder.
    Prioritizes old 1.0 style ('...lvlX_slide1.png') to reuse original assets.
    Returns the relative path from project root.
    """
    base_dir = os.path.join("assets", "generated_images", "reading", topic_id)
    
    # 1. Try finding the old 1.0 slide 1 image (PRIORITY)
    # Pattern: topic_lvlX_slide1.png
    old_style_pattern = os.path.join(base_dir, f"*_lvl{level_number}_slide1.png")
    matches = glob.glob(old_style_pattern)
    if matches:
        return matches[0]

    # 2. Try finding the old 1.0 slide 2 image (fallback)
    old_style_pattern_2 = os.path.join(base_dir, f"*_lvl{level_number}_slide2.png")
    matches_2 = glob.glob(old_style_pattern_2)
    if matches_2:
        return matches_2[0]

    # 3. Try finding the old 1.0 slide 3 image (fallback)
    old_style_pattern_3 = os.path.join(base_dir, f"*_lvl{level_number}_slide3.png")
    matches_3 = glob.glob(old_style_pattern_3)
    if matches_3:
        return matches_3[0]

    # 4. Try finding the old 1.0 quiz image (fallback)
    old_style_pattern_quiz = os.path.join(base_dir, f"*_lvl{level_number}_quiz.png")
    matches_quiz = glob.glob(old_style_pattern_quiz)
    if matches_quiz:
        return matches_quiz[0]
        
    return None

def generate_content_from_image(topic_name: str, subject: str, difficulty_code: int, level_number: int, image_path: str):
    """
    Generates lesson content based on an EXISTING image using Vision capabilities.
    """
    
    # Load the image for the model
    try:
        with open(image_path, "rb") as f:
            image_bytes = f.read()
    except Exception as e:
        print(f"❌ Error reading image {image_path}: {e}")
        return None

    prompt = f"""
    You are an expert curriculum developer and a fun, engaging 1st-grade teacher.
    Your task is to generate a lesson and a multiple-choice quiz for a specific level in an educational app.

    **Topic:** {topic_name}
    **Subject:** {subject}
    **Current Level:** {level_number} out of 10 
    **Difficulty Code:** {difficulty_code}

    **INPUT:** I have provided an image that will be the background for this level.
    
    **FORMAT: Storybook Carousel (Single Scene)**
    - **Concept:** This level uses the provided image as the SINGLE background.
    - **Introduction:** A separate object with ~3 sentences introducing the concept.
    - **Slides:** 3 "slides" (sentences) that tell a story about THIS specific image.
        - **Keywords:** 
            - For each **Slide**: Identify exactly **ONE** key noun that is clearly visible in the image and provide its emoji. This is the 'Visual Vocabulary'.
    
            **Instructions:**
            1.  **Analyze the Image:** Look closely at the provided image. What objects, characters, or actions are visible?
            2.  **Introduction:** Write ~3 warm sentences introducing the topic. **DO NOT include any emojis in the 'text' itself.**
            3.  **Slides:** Write 3 sentences describing the image. Each sentence must:
                - Focus on **ONE** specific object visible in the image.
                - Include a "keywords" map with exactly **ONE** entry for that object (word -> emoji).
                - **DO NOT include any emojis in the 'text' of the slide.**
                - **LENGTH LIMIT:** Each sentence must be **9 words long or shorter**.
            4.  **Quiz:** Create ONE multiple-choice quiz question related to the image or topic.
            5.  **Image Prompt:** Write a description of the image you see (to keep in the record).
                **JSON Output Schema (Strict JSON):**
        {{
          "topicName": "{topic_name}",
          "difficulty": {difficulty_code},
          "introduction": {{
            "text": "Intro text..."
          }},
    
      "imagePrompt": "Description of the provided image",
      "slides": [
        {{
          "text": "Sentence 1...",
          "keywords": {{ "word": "emoji" }}
        }},
        {{
          "text": "Sentence 2...",
          "keywords": {{ "word": "emoji" }}
        }},
        {{
          "text": "Sentence 3...",
          "keywords": {{ "word": "emoji" }}
        }}
      ],
      "quiz": [
        {{
          "question": "Question string",
          "options": ["A", "B", "C", "D"],
          "correctAnswer": "Correct Option String"
        }}
      ],
      "suggestedQuestions": ["Q1", "Q2"]
    }}
    """

    # Optimized for Quality: Using Gemini 2.5 Pro
    # (Ensuring high grammatical standards and adherence to instructions)
    response = client.models.generate_content(
        model='gemini-2.5-pro',
        contents=[prompt, genai_types.Part.from_bytes(data=image_bytes, mime_type="image/png")]
    )

    cleaned_response_text = response.text.strip().replace("```json", "").replace("```", "")
    lesson_data = json.loads(cleaned_response_text)
    
    # Clean quiz options (remove A., B., etc.)
    lesson_data = clean_quiz_options(lesson_data)
    
    return lesson_data


def main():
    """Main function to regenerate content using existing images."""
    
    current_subject_name = "Reading"
    current_curriculum = READING_CURRICULUM
    
    print(f"\n==================================================")
    print(f"Starting VISION REGENERATION for {current_subject_name}...")
    print(f"==================================================")

    for topic_name, topic_id, start_difficulty in current_curriculum:
        # Process ONLY Identifying Nouns for now
        if topic_id != "identifying_nouns":
            continue
        
        print(f"\n--- Processing Topic: {topic_name} ---")
        
        base_output_dir = os.path.join("generated_content", current_subject_name.lower(), topic_id)
        os.makedirs(base_output_dir, exist_ok=True)
        
        images_output_dir = os.path.join("assets", "generated_images", "reading", topic_id)
        os.makedirs(images_output_dir, exist_ok=True)
        
        for i in range(10): 
            level_number = i + 1
            
            # TEST: ONLY process Identifying Nouns Level 4
            if topic_id == "identifying_nouns" and level_number != 4:
                continue

            difficulty_code = start_difficulty + i
            filename = f"level_{level_number}.json"
            filepath = os.path.join(base_output_dir, filename)
            
            # 1. FIND EXISTING IMAGE
            existing_image_path = find_existing_image(topic_id, level_number)
            
            # RESUME LOGIC: Skip ONLY if both JSON and Image exist
            # if os.path.exists(filepath) and existing_image_path:
            #     print(f"  ⏭️  Skipping Level {level_number}: Content and image already exist.")
            #     continue
            
                        
            if not existing_image_path:
                print(f"  ⚠️ No existing image found for Level {level_number}. Generating new asset...")
                
                # A. Generate a prompt for the image
                prompt_gen_prompt = f"Write a detailed image prompt for a 'Studio Ghibli hand-painted whimsical anime' style scene about {topic_name} suitable for a 1st grade reading lesson (Level {level_number}). Output ONLY the prompt."
                prompt_response = client.models.generate_content(model='gemini-2.5-pro', contents=prompt_gen_prompt)
                image_prompt = prompt_response.text.strip()
                
                # B. Define new image path
                new_image_filename = f"level_{level_number}.png"
                new_image_path = os.path.join(images_output_dir, new_image_filename)
                
                # C. Generate the image
                if generate_image_for_level(image_prompt, new_image_path):
                    existing_image_path = new_image_path # Use this new image
                else:
                    print(f"  ❌ Failed to generate image for Level {level_number}. Skipping.")
                    continue

            print(f"  ⚡ Processing Level {level_number} using {existing_image_path}...")
            
            try:
                # 2. GENERATE CONTENT FROM IMAGE
                lesson_data = generate_content_from_image(topic_name, current_subject_name, difficulty_code, level_number, existing_image_path)
                
                if lesson_data:
                    # 3. Update JSON with the CORRECT local asset path
                    # Convert full path (assets/...) to relative asset path (generated_images/...)
                    # Flutter expects the path in the JSON to NOT have 'assets/' prefix if using the logic we set up?
                    # Wait, our code strips 'assets/' prefix. 
                    # Let's provide the path relative to 'assets/' folder.
                    
                    relative_asset_path = existing_image_path.replace("assets/", "")
                    
                    for slide in lesson_data['slides']:
                        slide['localImagePath'] = relative_asset_path
                        # Keep the vision-generated description as the prompt
                        slide['imagePrompt'] = lesson_data['imagePrompt']

                    # Include introduction only in Level 1
                    if level_number != 1:
                        if 'introduction' in lesson_data:
                            del lesson_data['introduction']

                    # 4. Save JSON
                    with open(filepath, 'w') as f:
                        json.dump(lesson_data, f, indent=2)
                    
                    print(f"  ✅ Regenerated Level {level_number}")
                
            except Exception as e:
                print(f"  ❌ Error Level {level_number}: {e}")
            
            time.sleep(2) 

    print("\n\n✅✅✅ Vision Regeneration Complete! ✅✅✅")


if __name__ == "__main__":
    main()
