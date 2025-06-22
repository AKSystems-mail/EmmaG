// Location: functions/src/index.ts

// Import HttpsError directly from the 'https' module
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {GoogleGenerativeAI} from "@google/generative-ai";
import {defineString} from "firebase-functions/params";

const geminiApiKey = defineString("GEMINI_KEY");

const sharedSecret = defineString("SHARED_SECRET");

export const askTheTutor = onCall({cors: true}, async (request) => {
  // --- THE NEW AUTHENTICATION CHECK ---
  // Get the secret key sent from the Flutter app in the headers.
  const clientSecret = request.rawRequest.headers["x-shared-secret"];

  // Check if the client's secret matches the one stored in our config.
  if (clientSecret !== sharedSecret.value()) {
    throw new HttpsError(
      "unauthenticated",
      "Invalid or missing secret key."
    );
  }

  const genAI = new GoogleGenerativeAI(geminiApiKey.value());
  const lessonContext = request.data.lessonContext;
  const userQuestion = request.data.userQuestion;

  if (!lessonContext || !userQuestion) {
    // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    // THE FIX: Throw a new HttpsError directly.
    // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    throw new HttpsError(
      "invalid-argument",
      "The function must be called with 'lessonContext' and 'userQuestion'."
    );
  }

  const prompt = `
    You are "Emma's Helper," a friendly, patient, and encouraging 
    tutor for a 6-year-old child.
    Your personality is gentle and positive.

    You MUST follow these rules strictly:
    1. Your answer must be based ONLY on the provided "Lesson Context."
    2. Do NOT use any outside knowledge.
    3. Keep your answers very short, simple, and easy for a child to 
    understand (1-2 sentences).
    4. If the user's question cannot be answered from the context, 
    respond with a friendly message like: "That's a wonderful question! 
    Let's focus on our lesson for now."

    ---
    Lesson Context: "${lessonContext}"
    ---
    Child's Question: "${userQuestion}"
    ---
    Your Answer:
  `;

  try {
    const model = genAI.getGenerativeModel({model: "gemini-1.5-pro"});
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return {answer: text};
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    // THE FIX: Throw a new HttpsError directly.
    // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    throw new HttpsError(
      "internal",
      "An error occurred while talking to the AI tutor."
    );
  }
});
