import os
import json
import time
from google import genai
from vertexai.preview.vision_models import ImageGenerationModel
import vertexai

# --- CONFIGURATION ---
API_KEY = os.environ.get("GEMINI_API_KEY")
PROJECT_ID = "emma-g-adventures" # Default project ID
LOCATION = "us-central1"
SERVICE_ACCOUNT_KEY_PATH = "service-account-key.json"

# Set credentials for Vertex AI
if os.path.exists(SERVICE_ACCOUNT_KEY_PATH):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = SERVICE_ACCOUNT_KEY_PATH
    print(f"✅ Vertex AI Authenticated using {SERVICE_ACCOUNT_KEY_PATH}")

vertexai.init(project=PROJECT_ID, location=LOCATION)
# Using Imagen 4 Fast as requested
imagen_model = ImageGenerationModel.from_pretrained("imagen-4.0-fast-generate-001")


if API_KEY:
    print("✅ Loading API Key from Environment Variable (GEMINI_API_KEY)")
else:
    # Try loading from .runtimeconfig.json
    try:
        with open(".runtimeconfig.json", "r") as f:
            config = json.load(f)
            API_KEY = config.get("gemini", {}).get("key")
            if API_KEY:
                print("✅ Loading API Key from .runtimeconfig.json")
    except FileNotFoundError:
        pass

if not API_KEY:
    print("❌ ERROR: No API Key found in Environment or .runtimeconfig.json")
    API_KEY = "INSERT_YOUR_API_KEY_HERE" 

# Initialize the new Google GenAI client
client = genai.Client(api_key=API_KEY)

# ==============================================================================
# THE CURRICULUM LIBRARY
# All curriculum lists are here. You will choose one in the main() function.
# ==============================================================================

MATH_CURRICULUM = [
    ("Single-Digit Addition", "addition_single_digit", 101),
    ("Single-Digit Subtraction", "subtraction_single_digit", 201),
    ("Counting to 100", "counting_to_100", 301),
    ("Basic Shapes (Circle, Square, Triangle)", "basic_shapes", 401),
    ("Comparing Numbers (<, >, =)", "comparing_numbers", 501),
    ("Introduction to Place Value (Tens and Ones)", "place_value_tens_ones", 601),
    ("Basic Measurement (Longer, Shorter)", "basic_measurement", 701),
    ("Telling Time to the Hour and Half-Hour", "telling_time_hour_half", 801),
    ("Introduction to Money (Identifying Coins)", "intro_money_coins", 901),
    ("Two-Digit Addition (No Regrouping)", "addition_two_digit_no_regroup", 1001),
]

READING_CURRICULUM = [
    ("Phonics: Short Vowel Sounds (a, e, i, o, u)", "phonics_short_vowels", 101),
    ("Basic Sight Words (the, a, is, you, to)", "sight_words_basic", 201),
    ("Understanding Sentences (Capital Letters and Periods)", "sentence_structure", 301),
    ("Word Families (e.g., -at, -an, -ip)", "word_families", 401),
    ("Identifying Nouns (Person, Place, or Thing)", "identifying_nouns", 501),
    ("Identifying Verbs (Action Words)", "identifying_verbs", 601),
    ("Reading Comprehension (Answering 'Who, What, Where')", "reading_comprehension_basic", 701),
    ("Sequencing (First, Next, Last in a Story)", "story_sequencing", 801),
    ("Punctuation (Question Marks and Exclamation Points)", "punctuation_marks", 901),
    ("Finding the Main Idea", "main_idea", 1001),
]

SCIENCE_CURRICULUM = [
    ("Living and Non-Living Things", "living_nonliving", 101),
    ("Parts of a Plant", "plant_parts", 201),
    ("Animal Types (Mammals, Birds, Fish)", "animal_types", 301),
    ("The Five Senses", "five_senses", 401),
    ("Types of Weather (Sunny, Rainy, Cloudy)", "weather_types", 501),
    ("The Four Seasons", "four_seasons", 601),
    ("Land, Water, and Air", "land_water_air", 701),
    ("States of Matter (Solid, Liquid, Gas)", "states_of_matter", 801),
    ("Pushes and Pulls (Basic Forces)", "pushes_pulls", 901),
    ("The Sun, Earth, and Moon", "sun_earth_moon", 1001),
]

WORLD_CURRICULUM = [
    ("All About Families", "families", 101),
    ("Community Helpers (Doctors, Firefighters, Teachers)", "community_helpers", 201),
    ("Rules and Laws (Why We Have Them)", "rules_and_laws", 301),
    ("Introduction to Maps (What is a Map?)", "intro_to_maps", 401),
    ("The Seven Continents", "seven_continents", 501),
    ("The Five Oceans", "five_oceans", 601),
    ("Holidays Around the World", "world_holidays", 701),
    ("Different Cultures and Traditions", "cultures_traditions", 801),
    ("Famous World Landmarks (Eiffel Tower, Pyramids)", "world_landmarks", 901),
    ("Long Ago and Today (Past and Present)", "past_and_present", 1001),
]

# --- THE SCRIPT ---
def generate_lesson_content(topic_name: str, subject: str, difficulty_code: int, level_number: int):
    """Generates lesson content and quiz questions using the Generative AI model."""

    # Custom Prompt for READING (Cohesive Story/Scene)
    if subject == "Reading":
        prompt = f"""
        You are an expert literacy curriculum developer for 1st graders.
        Your task is to create a cohesive 3-part lesson based on a SINGLE visual scene.

        **Topic:** {topic_name}
        **Subject:** Reading
        **Level:** {level_number} / 10
        **Difficulty Code:** {difficulty_code}

        **Strict Guidelines:** 
        1. Define a SINGLE, rich visual scene (e.g., "A cozy garden").
        2. Write 3 simple sentences. EACH sentence must describe a different detail of THAT SAME SCENE.
        3. **VISUAL CONSISTENCY:** Every object or noun mentioned in your sentences MUST be explicitly included in the image description. If you say "The cat has a ball," the image description must mention a cat and a ball.
        4. **KEYWORDS:** Identify EXACTLY ONE concrete noun per sentence to map to an emoji. Choose the word that is most important to the visual scene.

        **Requirements:**
        1.  **Slides:** Create exactly 3 slides.
            -   **Text:** 1 simple sentence (max 12 words) describing a part of the scene.
            -   **Image Prompt:** The exact same "Master Scene" description for ALL 3 slides. Use "Studio Ghibli" hand-painted, whimsical anime style. Be very descriptive about all objects mentioned in the sentences.
            -   **Keywords:** MUST be a JSON object (Map) with exactly ONE entry (e.g., {{"cat": "🐱"}}).

        2.  **Quiz:** 1 Multiple Choice Question related to the scene.
        3.  **Output:** Raw JSON only.

        **JSON Schema:**
        {{
          "topicName": "{topic_name}",
          "difficulty": {difficulty_code},
          "slides": [
            {{
              "text": "...",
              "imagePrompt": "...",
              "keywords": {{"word": "emoji"}},
              "localImagePath": "..."
            }},
            ... (3 slides)
          ],
          "quiz": [
            {{
              "question": "...",
              "imagePrompt": "...",
              "options": ["A", "B", "C", "D"],
              "correctAnswer": "..."
            }}
          ],
          "suggestedQuestions": ["...", "..."]
        }}
        """
    else:
        # Standard Prompt for other subjects (Math, Science, World)
        prompt = f"""
        You are an expert curriculum developer and a fun, engaging 1st-grade teacher.
        Your task is to generate a multi-slide lesson and a quiz for a specific level.

        **Topic:** {topic_name}
        **Subject:** {subject}
        **Level:** {level_number} / 10
        **Difficulty Code:** {difficulty_code}

        **Target Audience:** 6-year-olds. They cannot read large blocks of text.
        **Goal:** Visual learning with simple text.

        **Requirements:**
        1.  **Slides:** Create exactly 3 slides.
            -   **Text:** 1 simple sentence (max 12 words).
            -   **Image Prompt:** A detailed description for an AI image generator. 
                - **STYLE:** Must be in the "Studio Ghibli" hand-painted, whimsical anime style. 
                - **CONTENT:** Focus purely on the educational subject.
                - **AUDIENCE:** 1st-grade appropriate.
            -   **Keywords:** Identify 1-2 difficult or key words in the sentence and map them to a simple emoji or icon name (e.g., {{'apple': '🍎', 'add': 'plus_icon'}}).

        2.  **Quiz:** 1 Multiple Choice Question. Include an 'imagePrompt' that illustrates the question.
        3.  **Output:** Raw JSON only.

        **JSON Schema:**
        {{
          "topicName": "{topic_name}",
          "difficulty": {difficulty_code},
          "slides": [
            ... (3 slides)
          ],
          "quiz": [
            {{
              "question": "...",
              "imagePrompt": "...",
              "options": ["A", "B", "C", "D"],
              "correctAnswer": "..."
            }}
          ],
          "suggestedQuestions": ["...", "..."]
        }}
        """

    # Optimized for Best Price: Using Gemini 2.0 Flash-Lite ($0.075 / 1M tokens)
    response = client.models.generate_content(
        model='gemini-2.0-flash-lite',
        contents=prompt
    )

    cleaned_response_text = response.text.strip().replace("```json", "").replace("```", "")
    return json.loads(cleaned_response_text)

def generate_image_for_slide(prompt: str, output_path: str):
    """
    Calls the Imagen 4 Fast API to generate an image and saves it locally.
    """
    print(f"    [🎨 GENERATING IMAGE] Prompt: {prompt[:50]}...")
    
    try:
        # Generate the image
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
            # Check if image has content before saving
            try:
                if hasattr(image, '_image_bytes') and image._image_bytes:
                    image.save(location=output_path, include_generation_parameters=False)
                    print(f"    [💾 SAVED] To: {output_path}")
                else:
                    print(f"    [⚠️ WARNING] Image object has no content (likely blocked by safety filters).")
            except Exception as save_error:
                 print(f"    [❌ ERROR] Failed to save image object: {save_error}")
        else:
            print(f"    [⚠️ WARNING] No images returned from API.")
            
    except Exception as e:
        print(f"    [❌ ERROR] Image generation failed: {e}")


def main():
    """Main function to generate all content for the defined curriculum."""
    
    # Define all curricula to process
    all_curricula = [
        ("Math", MATH_CURRICULUM),
        ("Reading", READING_CURRICULUM),
        ("Science", SCIENCE_CURRICULUM),
        ("World", WORLD_CURRICULUM),
    ]
    
    for current_subject_name, current_curriculum in all_curricula:
        # TEST: Process only the "Reading" subject for the initial full-subject test
        if current_subject_name != "Reading":
            continue

        print(f"\n==================================================")
        print(f"Starting CONTENT FACTORY 2.0 for {current_subject_name}...")
        print(f"==================================================")
    
        for topic_name, topic_id, start_difficulty in current_curriculum:
            # FOCUS: Process ONLY 'main_idea'
            if topic_id != "main_idea":
                continue

            print(f"\n--- Processing Topic: {topic_name} ---")
            
            # Generate TOPIC INTRODUCTION
            intro_prompt = f"""
            Write a 3-sentence introduction for the topic: '{topic_name}'.
            The subject is Reading for 1st graders.
            The tone should be welcoming and educational.
            Each sentence should be simple (max 12 words).
            Identify EXACTLY ONE concrete noun in the entire 3-sentence text to highlight with an emoji.
            
            Output RAW JSON:
            {{
              "text": "The full 3 sentences here.",
              "keywords": {{"word": "emoji"}}
            }}
            """
            
            try:
                intro_response = client.models.generate_content(
                    model='gemini-2.0-flash-lite',
                    contents=intro_prompt
                )
                intro_json = json.loads(intro_response.text.strip('`').strip('json').strip())
            except Exception as e:
                print(f"  ⚠️ Error generating intro for {topic_id}: {e}")
                intro_json = {
                    "text": f"Welcome to {topic_name}! We are going to learn all about it today. Let's get started!",
                    "keywords": {}
                }

            # Create main directory for JSONs
            base_output_dir = os.path.join("generated_content", current_subject_name.lower(), topic_id)
            os.makedirs(base_output_dir, exist_ok=True)

            # Create subdirectory for Assets (Images)
            images_output_dir = os.path.join("assets", "generated_images", current_subject_name.lower(), topic_id)
            os.makedirs(images_output_dir, exist_ok=True)
            
            for i in range(10): # Full 10 levels for this test subject
                level_number = i + 1
                difficulty_code = start_difficulty + i
                filename = f"level_{level_number}.json"
                filepath = os.path.join(base_output_dir, filename)
                
                # CHECK: Does this file already exist AND do the images exist?
                skip_generation = False
                if os.path.exists(filepath):
                    try:
                        with open(filepath, 'r') as f:
                            existing_data = json.load(f)
                        
                        # Check for new format indicators: 'slides' list with 3 items
                        is_new_format = 'slides' in existing_data and len(existing_data['slides']) >= 3
                        
                        # Check if at least one image exists on disk
                        # (We check the quiz image as a proxy for the whole level)
                        quiz_img_path = os.path.join(images_output_dir, f"{topic_id}_lvl{level_number}_quiz.png")
                        images_exist = os.path.exists(quiz_img_path)

                        if is_new_format and images_exist:
                            skip_generation = True
                    except:
                        pass


                if skip_generation:
                    continue

                print(f"  ⚡ Generating Level {level_number} (New Format)...")
                
                try:
                    # 1. Generate Text Content
                    lesson_data = generate_lesson_content(topic_name, current_subject_name, difficulty_code, level_number) 
                    
                    # 2. Generate Images for each Slide
                    for slide_idx, slide in enumerate(lesson_data['slides']):
                        image_filename = f"{topic_id}_lvl{level_number}_slide{slide_idx + 1}.png"
                        image_path = os.path.join(images_output_dir, image_filename)
                        slide['localImagePath'] = f"assets/generated_images/{current_subject_name.lower()}/{topic_id}/{image_filename}"
                        generate_image_for_slide(slide['imagePrompt'], image_path)

                    # 2b. Generate Image for the Quiz
                    if 'quiz' in lesson_data and len(lesson_data['quiz']) > 0:
                        quiz_q = lesson_data['quiz'][0]
                        if 'imagePrompt' in quiz_q:
                            quiz_img_filename = f"{topic_id}_lvl{level_number}_quiz.png"
                            quiz_img_path = os.path.join(images_output_dir, quiz_img_filename)
                            quiz_q['localImagePath'] = f"assets/generated_images/{current_subject_name.lower()}/{topic_id}/{quiz_img_filename}"
                            generate_image_for_slide(quiz_q['imagePrompt'], quiz_img_path)

                    # 3. Save JSON
                    # Include introduction only in Level 1
                    if level_number == 1:
                        lesson_data["introduction"] = intro_json

                    with open(filepath, 'w') as f:
                        json.dump(lesson_data, f, indent=2)
                    
                    print(f"  ✅ Saved Level {level_number}")
                    
                except Exception as e:
                    print(f"  ❌ Error Level {level_number}: {e}")
                
                time.sleep(2) # Rate limit protection

    print("\n\n✅✅✅ Content Factory 2.0 Complete! ✅✅✅")


if __name__ == "__main__":
    main()