// Location: functions/src/index.ts

// v6.0 - The definitive version using onRequest and manual token verification.

import {onRequest} from "firebase-functions/v2/https";
import {GoogleGenerativeAI} from "@google/generative-ai";
import {TextToSpeechClient, protos} from "@google-cloud/text-to-speech";
import * as admin from "firebase-admin";

// Initialize the Firebase Admin SDK ONCE at the top level.
// This allows us to verify user tokens.
admin.initializeApp();

/**
 * A secure, publicly accessible function to interact with the Gemini AI tutor.
 * Security is handled by manually verifying the user's Firebase Auth ID token.
 */
export const askTheTutor = onRequest({cors: true}, async (request, response) => {
  // 1. Manually verify the auth token.
  const idToken = request.headers.authorization?.split("Bearer ")[1];
  if (!idToken) {
    console.error("askTheTutor: Unauthorized - No token provided.");
    response.status(401).send({error: {message: "Unauthorized."}});
    return;
  }
  try {
    await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    console.error("askTheTutor: Auth token verification failed:", error);
    response.status(401).send({error: {message: "Unauthorized: Invalid token."}});
    return;
  }

  // 2. If verification succeeds, proceed with the function's logic.
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
 * A secure, publicly accessible function to synthesize speech from text.
 * Security is handled by manually verifying the user's Firebase Auth ID token.
 */
export const synthesizeSpeech = onRequest({cors: true}, async (request, response) => {
  // 1. Manually verify the auth token.
  const idToken = request.headers.authorization?.split("Bearer ")[1];
  if (!idToken) {
    console.error("synthesizeSpeech: Unauthorized - No token provided.");
    response.status(401).send({error: {message: "Unauthorized."}});
    return;
  }
  try {
    await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    console.error("synthesizeSpeech: Auth token verification failed:", error);
    response.status(401).send({error: {message: "Unauthorized: Invalid token."}});
    return;
  }

  // 2. If verification succeeds, proceed with the function's logic.
  const text = request.body.data.text;
  if (!text) {
    response.status(400).send({error: {message: "Missing text."}});
    return;
  }

  const ttsClient = new TextToSpeechClient();
  const ttsRequest = {
    input: {text: text},
    voice: {languageCode: "en-US", name: "en-US-Standard-I"},
    audioConfig: {
      audioEncoding: protos.google.cloud.texttospeech.v1.AudioEncoding.MP3,
    },
  };

  try {
    const [ttsResponse] = await ttsClient.synthesizeSpeech(ttsRequest);
    if (!ttsResponse.audioContent) {
      throw new Error("Audio content is null.");
    }
    const audioBase64 = Buffer.from(ttsResponse.audioContent).toString("base64");
    response.status(200).send({result: {audioBase64: audioBase64}});
  } catch (error) {
    console.error("Error calling TTS API:", error);
    response.status(500).send({error: {message: "Failed to synthesize speech."}});
  }
});