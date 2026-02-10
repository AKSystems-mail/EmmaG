# Gemini Code Assistant Context

This document provides context for the Gemini Code Assistant to understand the "Emma G Adventures" project.

## Project Overview

"Emma G Adventures" is a Flutter-based mobile application designed for early elementary school education (around 1st grade). The app provides interactive lessons and quizzes on subjects like Math, Reading, Science, and World topics. It uses a gamified approach with levels, badges, and a friendly character named "Emma" to engage young learners.

The project is architected as follows:

*   **Frontend:** A Flutter application for Android and iOS.
*   **Backend:** Google Firebase is used for the backend, including:
    *   **Firestore:** Stores all educational content (lessons, quizzes, topics), user progress, and badge information.
    *   **Firebase Authentication:** Handles anonymous user sign-in to track progress.
    *   **Firebase Functions:** (Potentially used for backend logic, though not explicitly detailed in the provided files).
    *   **Firebase Hosting:** Hosts the web version of the app.
*   **Content Generation:** A set of Python scripts leverage a generative AI model (Gemini 2.0 Flash) to create the educational content (lessons and quizzes). This content is then uploaded to Firestore.

## Building and Running

### Flutter App

To run the Flutter app, you will need the Flutter SDK installed.

1.  **Install dependencies:**
    ```bash
    flutter pub get
    ```
2.  **Run the app:**
    ```bash
    flutter run
    ```

### Firebase Functions

The Firebase Functions are located in the `functions` directory.

1.  **Install dependencies:**
    ```bash
    cd functions
    npm install
    ```
2.  **Deploy functions:**
    ```bash
    firebase deploy --only functions
    ```

## Content Format 2.0 Specification

This project has transitioned to a "Storybook Carousel" format (v2.0). All new content must adhere to these rules:

### 1. Structure (JSON)
*   **Introduction:** A separate `introduction` object with ~3 warm sentences. **NO emojis and NO keywords map.**
*   **Single Scene:** One `imagePrompt` per level (Studio Ghibli style). All 3 slides share the same image.
*   **Slides (Carousel):** Exactly 3 slides. Each slide is a single sentence focusing on **ONE** specific object in the scene.
*   **Keywords (Visual Vocabulary):** Each slide must have exactly **ONE** keyword entry (`word`: `emoji`).
*   **No Embedded Emojis:** The AI must not put emojis in the `text` fields. The UI handles emoji display via the `keywords` map.
*   **Image Path:** `localImagePath` must be relative to the assets folder (e.g., `generated_images/science/topic/level_1.png`) to avoid `assets/assets/` path bugs.

### 2. UI Logic (lib/subject_screen.dart)
*   **Static Background:** The image from the first slide is used as a static background for the entire level.
*   **Text Carousel:** The `PageView` is text-only, carouseling through the 3 sentences.
*   **Cleaning Logic:** The UI strips punctuation and emojis from words before checking the `keywords` map and again before displaying the "Visual Vocabulary" label to prevent redundant emojis.

### 3. Generation Pipeline (Vision-Based Restoration)
This project uses a "Reclaim and Complete" strategy to transition subjects to 2.0 while reusing existing assets to minimize costs.

#### Workflow Steps:
1.  **Image Search Priority:** For each level, the script searches for an existing asset in this order:
    *   `*_lvlX_slide1.png` (Preferred)
    *   `*_lvlX_slide2.png` (Fallback 1)
    *   `*_lvlX_slide3.png` (Fallback 2)
2.  **Fill the Gaps:** If no image is found, the script generates a **new** image using Gemini (to write the prompt) and Imagen 4 Fast.
3.  **Vision Analysis:** The chosen image (existing or new) is passed to **Gemini 2.0 Flash-Lite (Vision)**.
4.  **Content Synthesis:** Gemini analyzes the image and writes:
    *   A warm, text-only **Introduction**.
    *   A 3-slide **Story** where each sentence matches an object actually visible in that specific image.
    *   A single-keyword **Visual Vocabulary** map for each slide.
5.  **Data Cleaning:**
    *   **Quiz Scrubbing:** All letter prefixes (e.g., "A. ", "B) ") are stripped from quiz options and correct answers.
    *   **Emoji Stripping:** Emojis are removed from all `text` fields; they only live in the `keywords` map.
6.  **Incremental Processing:** Process **one topic at a time** to avoid command timeouts.
7.  **Upload:** `upload_bulk.py` pushes the cleaned 2.0 JSONs to Firestore.

## Development Conventions

*   **Content Generation:** The `generate_content.py` script is used to generate new educational content. To add new topics, modify the curriculum lists in the script and run it.
*   **Content Upload:** The generated content is uploaded to Firestore using the `upload_to_firestore.py` or `upload_bulk.py` scripts. These scripts require a Firebase service account key (`service-account-key.json`).
*   **Firestore Data Structure:** The Firestore database is structured as follows:
    *   `subjects/{subjectId}/topics/{topicId}/levels/{levelId}`: Contains the lesson and quiz data for each level.
    *   `users/{userId}/progress/{subjectId}`: Stores the user's progress for each subject.
    *   `badges/{badgeId}`: Contains information about the badges that can be earned.
*   **Code Style:** The Dart code follows the standard Flutter and Dart conventions. The Python scripts are straightforward and procedural.

## Key Files

*   `pubspec.yaml`: Defines the Flutter app's dependencies and project metadata.
*   `lib/main.dart`: The entry point of the Flutter application.
*   `lib/subject_screen.dart`: The screen that displays the lesson content for a specific subject.
*   `lib/quiz_screen.dart`: The screen that displays the quiz for a lesson.
*   `firebase.json`: Configures Firebase services, including Functions and Hosting.
*   `generate_content.py`: The Python script for generating educational content using a generative AI model.
*   `upload_to_firestore.py`: A Python script for uploading a single piece of generated content to Firestore.
*   `upload_bulk.py`: (Assumed) A Python script for uploading all generated content to Firestore.
*   `functions/src/index.ts`: (Assumed) The main file for Firebase Functions, containing backend logic.
