// Location: lib/chat_screen.dart

import 'package:flutter/material.dart';
// Import the Cloud Functions package
import 'package:cloud_functions/cloud_functions.dart';

// A simple data class to hold our chat messages and who sent them.
class ChatMessage {
  final String text;
  final bool isUser;

  ChatMessage({required this.text, required this.isUser});
}

class ChatScreen extends StatefulWidget {
  final String lessonContext;

  const ChatScreen({super.key, required this.lessonContext});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _textController = TextEditingController();
  final List<ChatMessage> _messages = [];
  bool _isLoading = false;

  // This is the core function that connects the UI to our backend.
  Future<void> _sendMessage() async {
    if (_textController.text.isEmpty || _isLoading) return;

    final userMessageText = _textController.text;

    // Add the user's message to the UI immediately.
    setState(() {
      _messages.add(ChatMessage(text: userMessageText, isUser: true));
      _isLoading = true; // Show the loading spinner
    });

    _textController.clear();

    try {
      // 1. Get a reference to our deployed Cloud Function.
      final callable = FirebaseFunctions.instance.httpsCallable('askTheTutor');

      // 2. Call the function, passing the lesson context and the user's question.
      final result = await callable.call<Map<String, dynamic>>({
        'lessonContext': widget.lessonContext,
        'userQuestion': userMessageText,
      });

      // 3. Get the AI's answer from the function's response.
      final aiResponseText = result.data['answer'] as String? ?? "Sorry, I had a problem thinking.";

      // 4. Add the AI's response to the chat.
      setState(() {
        _messages.add(ChatMessage(text: aiResponseText, isUser: false));
      });

    } on FirebaseFunctionsException catch (e) {
      setState(() {
        _messages.add(ChatMessage(text: "Error: ${e.message}", isUser: false));
      });
      print("Firebase Functions Error: ${e.code} - ${e.message}");
    } catch (e) {
      setState(() {
        _messages.add(ChatMessage(text: "An unexpected error occurred.", isUser: false));
      });
      print("Generic Error: $e");
    } finally {
      // 5. Hide the loading indicator.
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Ask Emma's Helper"),
        backgroundColor: Colors.teal.shade400,
      ),
      body: Column(
        children: [
          // This ListView will display the chat messages.
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(8.0),
              itemCount: _messages.length,
              itemBuilder: (context, index) {
                final message = _messages[index];
                return Align(
                  alignment: message.isUser ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.symmetric(vertical: 5.0, horizontal: 8.0),
                    padding: const EdgeInsets.all(12.0),
                    decoration: BoxDecoration(
                      color: message.isUser ? Colors.blue.shade300 : Colors.grey.shade300,
                      borderRadius: BorderRadius.circular(16.0),
                    ),
                    child: Text(
                      message.text,
                      style: const TextStyle(fontSize: 16, color: Colors.black87),
                    ),
                  ),
                );
              },
            ),
          ),

          if (_isLoading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8.0),
              child: CircularProgressIndicator(),
            ),

          // The text input area
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _textController,
                    decoration: const InputDecoration(
                      hintText: "Ask a question...",
                      border: OutlineInputBorder(),
                    ),
                    onSubmitted: (_) => _sendMessage(),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  icon: const Icon(Icons.send),
                  onPressed: _sendMessage,
                  style: IconButton.styleFrom(
                    padding: const EdgeInsets.all(12),
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