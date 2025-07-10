// Location: functions/src/index.ts

// v2.0 - Reverting to functions.config() for stability.

import * as functions from "firebase-functions";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {GoogleGenerativeAI} from "@google/generative-ai";
import * as textToSpeech from "@google-cloud/text-to-speech";

// --- askTheTutor Function ---
export const askTheTutor = onCall({cors: true}, async (request) => {
  if (!request.auth) {
    throw new
    HttpsError("unauthenticated",
      "The function must be called while authenticated.");
  }

  // THE FIX: Read config inside the function and initialize the client here
  const apiKey = functions.config().gemini.key;
  if (!apiKey) {
    throw new HttpsError("internal", "Gemini API key is not configured.");
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  // --- END OF FIX ---

  const lessonContext = request.data.lessonContext;
  const userQuestion = request.data.userQuestion;

  if (!lessonContext || !userQuestion) {
    throw new HttpsError("invalid-argument", "Missing required data.");
  }

  const prompt = `
    You are "Emma's Helper," a friendly tutor for a 6-year-old child.
    Keep answers to 1-2 simple sentences.
    Base your answer ONLY on the provided "Lesson Context."
    If the question is not in the context, say: 
    "That's a great question! Let's focus on our lesson for now."
    ---
    Lesson Context: "${lessonContext}"
    ---
    Child's Question: "${userQuestion}"
    ---
    Your Answer:
  `;

  try {
    const model = genAI.getGenerativeModel({model: "gemini-1.5-flash"});
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return {answer: text};
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new HttpsError("internal", "An error occurred with the AI tutor.");
  }
});


// --- synthesizeSpeech Function ---
export const synthesizeSpeech = onCall({cors: true}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Function must be called.");
  }

  const text = request.data.text;
  if (!text) {
    throw new HttpsError("invalid-argument", "Missing required data.");
  }

  const ttsClient = new textToSpeech.TextToSpeechClient();
  const ttsRequest = {
    input: {text: text},
    voice: {languageCode: "en-US", name: "en-US-Standard-I"},
    audioConfig: {audioEncoding: "MP3" as const},
  };

  try {
    const [ttsResponse] = await ttsClient.synthesizeSpeech(ttsRequest);
    if (!ttsResponse.audioContent) {
      throw new Error("Audio content is null.");
    }
    const audioBase64 =
    Buffer.from(ttsResponse.audioContent).toString("base64");
    return {audioBase64: audioBase64};
  } catch (error) {
    console.error("Error calling Text-to-Speech API:", error);
    throw new HttpsError("internal", "Failed to synthesize speech.");
  }
});
