// Location: functions/src/index.ts

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {GoogleGenerativeAI} from "@google/generative-ai";
import {defineString} from "firebase-functions/params";
import * as textToSpeech from "@google-cloud/text-to-speech";

const geminiApiKey = defineString("GEMINI_KEY");

// --- askTheTutor Function ---
export const askTheTutor = onCall(async (request) => {
  const genAI = new GoogleGenerativeAI(geminiApiKey.value());
  const lessonContext = request.data.lessonContext;
  const userQuestion = request.data.userQuestion;

  if (!lessonContext || !userQuestion) {
    throw new HttpsError(
      "invalid-argument",
      "The function must be called with 'lessonContext' and 'userQuestion'."
    );
  }

  const prompt = `
    You are "Emma's Helper," a friendly, patient, 
    and encouraging tutor for a 6-year-old child.
    Your personality is gentle and positive.
    You MUST follow these rules strictly:
    1. Your answer must be based ONLY on the provided "Lesson Context."
    2. Do NOT use any outside knowledge.
    3. Keep your answers very short, simple, 
    and easy for a child to understand (1-2 sentences).
    4. If the user's question cannot be answered from the context, 
    respond with a friendly message like: 
    "That's a wonderful question! Let's focus on our lesson for now."
    ---
    Lesson Context: "${lessonContext}"
    ---
    Child's Question: "${userQuestion}"
    ---
    Your Answer:
  `;

  try {
    const model = genAI.getGenerativeModel({model: "gemini-2.0-flash"});
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return {answer: text};
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new HttpsError(
      "internal", "An error occurred while talking to the AI tutor.");
  }
});

// --- synthesizeSpeech Function ---
export const synthesizeSpeech = onCall(async (request) => {
  const text = request.data.text;

  if (!text) {
    throw new HttpsError(
      "invalid-argument",
      "The function must be called with 'text' to synthesize.");
  }

  const ttsClient = new textToSpeech.TextToSpeechClient();

  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  // THE FIX: Define the type for our request object explicitly.
  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  const ttsRequest:
  textToSpeech.protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
    input: {text: text},
    voice: {languageCode: "en-US", name: "en-US-Wavenet-D"},
    // The type now explicitly matches what the library expects.
    audioConfig: {audioEncoding: "MP3"},
  };

  try {
    // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    // THE FIX: Get the result safely without destructuring.
    // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    const ttsResponse = await ttsClient.synthesizeSpeech(ttsRequest);
    // The actual response is the first element of the returned array.
    const response = ttsResponse[0];

    if (!response.audioContent) {
      throw new Error("Audio content is null or undefined.");
    }
    const audioContent = response.audioContent as Uint8Array;
    const audioBase64 = Buffer.from(audioContent).toString("base64");

    return {audioBase64: audioBase64};
  } catch (error) {
    console.error("Error calling Text-to-Speech API:", error);
    throw new HttpsError("internal", "Failed to synthesize speech.");
  }
});
