// Location: lib/auth_screen.dart

import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
// ADD THIS IMPORT to talk to Firestore
import 'package:cloud_firestore/cloud_firestore.dart';
import 'main.dart';

// No changes needed to the AuthGate widget.
class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const LoginScreen();
        }
        return const MainMenuScreen();
      },
    );
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading = false;

  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  // NEW FUNCTION: Creates starting data for a new user.
  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  Future<void> _createInitialProgressData(String userId) async {
    // A list of all subjects we want to track.
    final subjects = ['math', 'reading', 'science', 'world'];
    
    // Get a reference to the user's document in the 'users' collection.
    final userDocRef = FirebaseFirestore.instance.collection('users').doc(userId);

    // We use a "batch" to perform multiple writes at once. It's more efficient.
    final batch = FirebaseFirestore.instance.batch();

    for (var subject in subjects) {
      // For each subject, create a new progress document.
      final progressDocRef = userDocRef.collection('progress').doc(subject);
      batch.set(progressDocRef, {
        'currentLevel': 1, // Everyone starts at level 1
        'masteryScore': 0,
      });
    }

    // Commit the batch to save all the documents to Firestore.
    await batch.commit();
  }

  Future<void> _signUp() async {
    if (_isLoading) return;
    setState(() => _isLoading = true);

    try {
      // 1. Create the user with email and password.
      final userCredential = await FirebaseAuth.instance.createUserWithEmailAndPassword(
        email: _emailController.text.trim(),
        password: _passwordController.text.trim(),
      );

      // 2. Check if the user was actually created and has a UID.
      if (userCredential.user != null) {
        // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        // UPDATED: If signup is successful, create their progress data.
        // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        await _createInitialProgressData(userCredential.user!.uid);
      }
      // The AuthGate will handle navigation automatically.

    } on FirebaseAuthException catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message ?? "An error occurred.")),
      );
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  // No changes needed to the _logIn function.
  Future<void> _logIn() async {
    if (_isLoading) return;
    setState(() => _isLoading = true);

    try {
      await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: _emailController.text.trim(),
        password: _passwordController.text.trim(),
      );
    } on FirebaseAuthException catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message ?? "An error occurred.")),
      );
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  // No changes needed to the build method.
  @override
  Widget build(BuildContext context) {
    // ... The rest of your LoginScreen build method is correct.
    // It can stay exactly as it is.
    return Scaffold(
      body: Stack(
        children: [
          Container(
            decoration: const BoxDecoration(
              image: DecorationImage(
                image: AssetImage("assets/images/main_background.png"),
                fit: BoxFit.cover,
              ),
            ),
          ),
          Container(
            color: Colors.black.withOpacity(0.5),
          ),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(30.0),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text(
                      "Parent's Gate",
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 36,
                        fontWeight: FontWeight.bold,
                        fontFamily: 'Faculty Glyphic',
                      ),
                    ),
                    const SizedBox(height: 40),
                    Card(
                      color: Colors.white.withOpacity(0.9),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16.0),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(24.0),
                        child: Column(
                          children: [
                            TextField(
                              controller: _emailController,
                              decoration: const InputDecoration(labelText: 'Email'),
                              keyboardType: TextInputType.emailAddress,
                            ),
                            const SizedBox(height: 16),
                            TextField(
                              controller: _passwordController,
                              decoration: const InputDecoration(labelText: 'Password'),
                              obscureText: true,
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 32),
                    if (_isLoading)
                      const CircularProgressIndicator()
                    else
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: [
                          ElevatedButton(
                            style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 30, vertical: 12)),
                            onPressed: _logIn,
                            child: const Text('Log In', style: TextStyle(fontSize: 16)),
                          ),
                          ElevatedButton(
                            style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 30, vertical: 12)),
                            onPressed: _signUp,
                            child: const Text('Sign Up', style: TextStyle(fontSize: 16)),
                          ),
                        ],
                      )
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}