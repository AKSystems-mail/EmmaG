// Location: functions/src/index.ts

// v6.2 - The definitive version with correct modular Admin SDK imports.

import {onRequest} from "firebase-functions/v2/https";
import {GoogleGenerativeAI} from "@google/generative-ai";
import {TextToSpeechClient, protos} from "@google-cloud/text-to-speech";

// +++ THE FIX: Import services modularly +++
import {initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";

// Initialize the Firebase Admin SDK ONCE at the top level.
initializeApp();

/**
 * A secure, publicly accessible function to interact with the Gemini AI tutor.
 */
export const askTheTutor =
onRequest({cors: true}, async (request, response) => {
  const idToken = request.headers.authorization?.split("Bearer ")[1];
  if (!idToken) {
    response.status(401).send({error: {message: "Unauthorized."}});
    return;
  }
  try {
    // Use the imported getAuth() method to verify the token.
    await getAuth().verifyIdToken(idToken);
  } catch (error) {
    console.error("Auth token verification failed:", error);
    response.status(401).send({error: {message:
      "Unauthorized: Invalid token."}});
    return;
  }

  const apiKey = process.env.GEMINI_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY not found in environment.");
    response.status(500).send({error: {message: "API key not configured."}});
    return;
  }
  const genAI = new GoogleGenerativeAI(apiKey);

  const lessonContext = request.body.data.lessonContext;
  const userQuestion = request.body.data.userQuestion;
  const topicName = request.body.data.topicName; // This is now correct

  if (!lessonContext || !userQuestion) {
    response.status(400).send({error: {message: "Missing required data."}});
    return;
  }

  const prompt = `
    You are "Emma's Helper," a friendly, patient, and encouraging tutor for a
    6-year-old child. Your goal is to be helpful and keep the child engaged
    with the lesson's topic.

    Here is your decision-making process:
    1.  **Is the Child's Question answered directly by the "Lesson Context"?**
        If yes, answer it simply using only that information.

    2.  **If not, is the Child's Question still related to the main "Topic"?**
        If yes, it's okay to use your general knowledge to provide a simple,
        one-sentence, age-appropriate answer. After you answer, you MUST
        gently guide them back to the lesson by saying something like,
        "That's a great question! Now, let's get back to our activity!"

    3.  **If the question is NOT related to the "Topic" at all,** you MUST NOT
        answer it. Instead, you MUST choose ONE of the following three
        friendly responses, and only these responses:
        - "That's a wonderful question! Let's focus on our lesson for now."
        - "What a curious thought! My job is to help with our lesson, but maybe we can look that up together later!"
        - "You have such a great imagination! Let's save that question for after our lesson is done."

    ---
    Topic: "${topicName}"
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
 */
export const synthesizeSpeech =
onRequest({cors: true}, async (request, response) => {
  const idToken = request.headers.authorization?.split("Bearer ")[1];
  if (!idToken) {
    response.status(401).send({error: {message: "Unauthorized."}});
    return;
  }
  try {
    // Use the imported getAuth() method here as well.
    await getAuth().verifyIdToken(idToken);
  } catch (error) {
    console.error("Auth token verification failed:", error);
    response.status(401).send({error: {message:
      "Unauthorized: Invalid token."}});
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
