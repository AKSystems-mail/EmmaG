// Location: lib/chat_screen.dart

import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:firebase_auth/firebase_auth.dart';
import 'sound_manager.dart';

class ChatMessage {
  final String text;
  final bool isUser;
  ChatMessage({required this.text, required this.isUser});
}

class ChatScreen extends StatefulWidget {
  final String lessonContext;
  final List<String>? suggestedQuestions; // Make this optional

  const ChatScreen({
    super.key,
    required this.lessonContext,
    this.suggestedQuestions,
  });

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _textController = TextEditingController();
  final List<ChatMessage> _messages = [];
  bool _isLoading = false;

  // This function calls the backend with a given question string.
// In lib/chat_screen.dart, inside _ChatScreenState

// This is the single, corrected function.
  Future<void> _callCloudFunction(String questionToSend) async {
    if (_isLoading) return;

    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      print("CRITICAL ERROR: User is not logged in.");
      return;
    }

    setState(() { _isLoading = true; });

    try {
      // 1. Get a fresh ID token from the user.
      final idToken = await user.getIdToken(true);
      const sharedSecret = "AIzaSyBjyGnXFegHgJp_tYhoYkwpzIeXhCwdNgE"; // <-- PASTE HERE

      // 2. Define the exact URL of your Cloud Function.
      final url = Uri.parse("https://us-central1-emma-g-adventures.cloudfunctions.net/askTheTutor");

      // 3. Manually build the request headers. This is the crucial part.
      final headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $idToken',
        'x-shared-secret': sharedSecret, // We explicitly add the auth token.
      };

      // 4. Manually build the request body.
      final body = jsonEncode({
        'data': { // Callable functions expect the data to be inside a 'data' key.
          'lessonContext': widget.lessonContext,
          'userQuestion': questionToSend,
        }
      });

      // 5. Make the HTTP POST request.
      final response = await http.post(url, headers: headers, body: body);

      // 6. Decode the response.
      if (response.statusCode == 200) {
        final responseData = jsonDecode(response.body);
        // Callable functions wrap their response in a 'result' key.
        final aiResponseText = responseData['result']['answer'] as String? ?? "Sorry, I couldn't understand the response.";
        setState(() {
          _messages.add(ChatMessage(text: aiResponseText, isUser: false));
        });
      } else {
        // If the server returned an error (like 403, 500, etc.)
        print("HTTP Error: ${response.statusCode}");
        print("Response Body: ${response.body}");
        final errorData = jsonDecode(response.body);
        final errorMessage = errorData['error']['message'] ?? "An unknown error occurred.";
        setState(() {
          _messages.add(ChatMessage(text: "Tutor Error: $errorMessage", isUser: false));
        });
      }
    } catch (e) {
      // Handle any other unexpected errors (like no internet).
      setState(() {
        _messages.add(ChatMessage(text: "An unexpected error occurred.", isUser: false));
      });
      print("Generic Error: $e");
    } finally {
      if(mounted){ setState(() { _isLoading = false; }); }
    }
  }

  // This is called when the user types and presses send.
  void _sendMessageFromTextField() {
    if (_textController.text.isNotEmpty) {
      _callCloudFunction(_textController.text);
    }
  }

  // This is called when a suggested question button is tapped.
  void _sendSuggestedQuestion(String question) {
    SoundManager.playClickSound();
    // Add the suggested question to the chat as if the user typed it
    setState(() {
      _messages.add(ChatMessage(text: question, isUser: true));
    });
    // Call the backend with this question
    _callCloudFunction(question);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Ask Emma's Helper"),
        backgroundColor: const Color.fromARGB(255, 207, 163, 226), // Your chosen color
      ),
      body: Stack(
        children: [
          Container(
            decoration: const BoxDecoration(
              image: DecorationImage(
                image: AssetImage("assets/images/chat_screen_background.png"),
                fit: BoxFit.cover,
              ),
            ),
          ),
          Container(color: Colors.black.withOpacity(0.3)),
          Column(
            children: [
              // Suggested Questions Area
              if (widget.suggestedQuestions != null && widget.suggestedQuestions!.isNotEmpty && _messages.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(12.0),
                  child: Wrap(
                    spacing: 8.0,
                    runSpacing: 8.0,
                    alignment: WrapAlignment.center,
                    children: widget.suggestedQuestions!.map((question) {
                      return ElevatedButton(
                        onPressed: () => _sendSuggestedQuestion(question),
                        child: Text(question, textAlign: TextAlign.center),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.teal.shade100.withOpacity(0.9),
                          foregroundColor: Colors.teal.shade900,
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          textStyle: const TextStyle(fontSize: 14),
                        ),
                      );
                    }).toList(),
                  ),
                ),
              // Chat Messages Area
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
                        padding: const EdgeInsets.symmetric(horizontal: 14.0, vertical: 10.0),
                        decoration: BoxDecoration(
                          color: message.isUser
                              ? Colors.blue.shade300.withOpacity(0.85)
                              : Colors.grey.shade200.withOpacity(0.85),
                          borderRadius: BorderRadius.only(
                            topLeft: const Radius.circular(16),
                            topRight: const Radius.circular(16),
                            bottomLeft: message.isUser ? const Radius.circular(16) : const Radius.circular(0),
                            bottomRight: message.isUser ? const Radius.circular(0) : const Radius.circular(16),
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.15),
                              blurRadius: 3,
                              offset: const Offset(1, 2),
                            )
                          ],
                        ),
                        child: Text(
                          message.text,
                          style: TextStyle(
                            fontSize: 16,
                            color: message.isUser ? Colors.white : Colors.black87,
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
              // Loading Indicator
              if (_isLoading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8.0),
                  child: CircularProgressIndicator(),
                ),
              // Text Input Area
              Padding(
                padding: const EdgeInsets.all(8.0),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _textController,
                        decoration: InputDecoration(
                          hintText: "Ask a question...",
                          filled: true,
                          fillColor: Colors.white.withOpacity(0.9),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(12),
                            borderSide: BorderSide.none,
                          ),
                        ),
                        onSubmitted: (_) => _sendMessageFromTextField(),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      icon: const Icon(Icons.send),
                      onPressed: _sendMessageFromTextField, // Changed to new specific function
                      style: IconButton.styleFrom(
                        backgroundColor: Colors.purple.shade600,
                        padding: const EdgeInsets.all(12),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}