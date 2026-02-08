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
