// Location: functions/src/index.ts

// v5.2 - The definitive, stable version using onRequest and process.env.

import {onRequest} from "firebase-functions/v2/https";
import {GoogleGenerativeAI} from "@google/generative-ai";
import {TextToSpeechClient, protos} from "@google-cloud/text-to-speech";

/**
 * A secure, callable function to interact with the Gemini AI tutor.
 */
export const askTheTutor =
onRequest({cors: true}, async (request, response) => {
  // Manually verify the auth token for security.
  if (!request.headers.authorization?.startsWith("Bearer ")) {
    console.error("askTheTutor: Unauthenticated request.");
    response.status(401).send({error: {message: "Unauthorized."}});
    return;
  }

  // Read the API key directly from the process environment.
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY not found in environment.");
    response.status(500).send({error: {message: "API key not configured."}});
    return;
  }
  const genAI = new GoogleGenerativeAI(apiKey);

  const lessonContext = request.body.data.lessonContext;
  const userQuestion = request.body.data.userQuestion;

  if (!lessonContext || !userQuestion) {
    response.status(400).send({error: {message: "Missing required data."}});
    return;
  }

  const prompt = `
    You are "Emma's Helper," a friendly, patient, and encouraging tutor for a
    6-year-old child. Your personality is gentle and positive.

    You MUST follow these rules strictly:
    1. Your answer must be based ONLY on the provided "Lesson Context."
    2. Do NOT use any outside knowledge.
    3. Keep your answers very short, simple, and easy for a child to
       understand (1-2 sentences).
    4. If the user's question cannot be answered from the context, respond
       with a friendly message like: "That's a wonderful question! Let's
       focus on our lesson for now."

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
    const res = await result.response;
    const text = res.text();
    response.status(200).send({result: {answer: text}});
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    response.status(500).send({error: {message: "Error with AI tutor."}});
  }
});

/**
 * A secure, callable function to synthesize speech from text.
 */
export const synthesizeSpeech =
onRequest({cors: true}, async (request, response) => {
  if (!request.headers.authorization?.startsWith("Bearer ")) {
    console.error("synthesizeSpeech: Unauthenticated request.");
    response.status(401).send({error: {message: "Unauthorized."}});
    return;
  }

  const text = request.body.data.text;
  if (!text) {
    response.status(400).send({error: {message: "Missing text."}});
    return;
  }

  const ttsClient = new TextToSpeechClient();
  const ttsRequest = {
    input: {text: text},
    voice: {languageCode: "en-US", name: "en-US-Standard-I"},
    // Use the official enum from the library for type safety.
    audioConfig: {
      audioEncoding: protos.google.cloud.texttospeech.v1.AudioEncoding.MP3,
    },
  };

  try {
    const [ttsResponse] = await ttsClient.synthesizeSpeech(ttsRequest);
    if (!ttsResponse.audioContent) {
      throw new Error("Audio content is null.");
    }
    const audioBase64 =
    Buffer.from(ttsResponse.audioContent).toString("base64");
    response.status(200).send({result: {audioBase64: audioBase64}});
  } catch (error) {
    console.error("Error calling TTS API:", error);
    response.status(500).send({error: {message:
      "Failed to synthesize speech."}});
  }
});
