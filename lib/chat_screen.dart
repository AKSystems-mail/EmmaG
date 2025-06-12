// Location: lib/chat_screen.dart

import 'package:flutter/material.dart';

class ChatScreen extends StatelessWidget {
  // The chat screen needs to know the lesson context to send to the AI later.
  final String lessonContext;

  const ChatScreen({super.key, required this.lessonContext});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Ask Emma's Helper"),
        backgroundColor: Colors.teal.shade400,
      ),
      body: Column(
        children: [
          // This will eventually show the chat messages
          Expanded(
            child: Center(
              child: Text(
                "The AI Tutor chat will go here!",
                style: TextStyle(fontSize: 18, color: Colors.grey.shade600),
              ),
            ),
          ),

          // This is where the user will type their message
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: Row(
              children: [
                const Expanded(
                  child: TextField(
                    decoration: InputDecoration(
                      hintText: "Ask a question...",
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  icon: const Icon(Icons.send),
                  onPressed: () {
                    // TODO: Send message to the AI
                    print("Sending message...");
                    print("Lesson Context: $lessonContext");
                  },
                  style: IconButton.styleFrom(
                    backgroundColor: Colors.teal,
                    foregroundColor: Colors.white,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}