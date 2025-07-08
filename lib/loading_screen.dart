// Location: lib/loading_screen.dart

import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'main.dart'; // To access MainMenuScreen

class LoadingScreen extends StatefulWidget {
  const LoadingScreen({super.key});

  @override
  State<LoadingScreen> createState() => _LoadingScreenState();
}

class _LoadingScreenState extends State<LoadingScreen> {
  @override
  void initState() {
    super.initState();
    _handleAuth();
  }

  Future<void> _handleAuth() async {
    try {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) {
        final userCredential = await FirebaseAuth.instance.signInAnonymously();
        print("Signed in anonymously with UID: ${userCredential.user?.uid}");
        // TODO: Create initial progress data for this new anonymous user.
      } else {
        print("User already signed in with UID: ${user.uid}");
      }

      // --- THE FIX ---
      // Don't navigate directly. Instead, schedule the navigation to happen
      // right after the current build frame is finished.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          // Ensure the widget is still part of the tree
          Navigator.of(context).pushReplacement(
            MaterialPageRoute(builder: (context) => const MainMenuScreen()),
          );
        }
      });
    } catch (e) {
      print("Error during auth: $e");
      // You could show an error UI here if auth fails
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // Use a Stack to layer the background and the spinner
      body: Stack(
        children: [
          // 1. Use the same beautiful background as your main menu.
          Container(
            decoration: const BoxDecoration(
              image: DecorationImage(
                image: AssetImage("assets/images/main_background.png"),
                fit: BoxFit.cover,
              ),
            ),
          ),
          // 2. Use the same semi-transparent overlay.
          Container(color: Colors.black.withOpacity(0.4)),
          // 3. Put the spinner and some text in the center.
          const Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                CircularProgressIndicator(
                  color: Colors.white, // Make the spinner white to stand out
                ),
                SizedBox(height: 20),
                Text(
                  "The Adventure Is Starting...",
                  style: TextStyle(color: Colors.white, fontSize: 18),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
