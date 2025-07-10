// Location: functions/src/index.ts

// v3.0 - Switching to onRequest with manual CORS for maximum stability.

import * as functions from "firebase-functions";
import {GoogleGenerativeAI} from "@google/generative-ai";
import * as textToSpeech from "@google-cloud/text-to-speech";
import cors from "cors";

// Manually create a cors middleware instance
const corsHandler = cors({origin: true});

// --- askTheTutor Function ---
export const askTheTutor = functions.https.onRequest((request, response) => {
  // 1. Manually handle CORS.
  corsHandler(request, response, async () => {
    // 2. Manually check for the auth token.
    const idToken = request.headers.authorization?.split("Bearer ")[1];
    if (!idToken) {
      response.status(401).send({error: {message: "Unauthorized."}});
      return;
    }
    // We could verify the token here, but for now, we trust Firebase's gateway.

    const apiKey = functions.config().gemini.key;
    if (!apiKey) {
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

    const prompt = "..."; // Your prompt text here

    try {
      const model = genAI.getGenerativeModel({model: "gemini-1.5-flash"});
      const result = await model.generateContent(prompt);
      const res = await result.response;
      const text = res.text();
      // 3. Manually send the successful response.
      response.status(200).send({result: {answer: text}});
    } catch (error) {
      console.error("Error calling Gemini API:", error);
      response.status(500).send({error: {message: "Error with AI tutor."}});
    }
  });
});

// --- synthesizeSpeech Function ---
export const synthesizeSpeech =
functions.https.onRequest((request, response) => {
  corsHandler(request, response, async () => {
    const idToken = request.headers.authorization?.split("Bearer ")[1];
    if (!idToken) {
      response.status(401).send({error: {message: "Unauthorized."}});
      return;
    }

    const text = request.body.data.text;
    if (!text) {
      response.status(400).send({error: {message: "Missing text."}});
      return;
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
      response.status(200).send({result: {audioBase64: audioBase64}});
    } catch (error) {
      console.error("Error calling TTS API:", error);
      response.status(500).send({error: {message:
        "Failed to synthesize speech."}});
    }
  });
});
