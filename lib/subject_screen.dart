// Location: lib/subject_screen.dart

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'quiz_screen.dart';
import 'chat_screen.dart';

class SubjectScreen extends StatefulWidget {
  final String subjectName;

  const SubjectScreen({super.key, required this.subjectName});

  @override
  State<SubjectScreen> createState() => _SubjectScreenState();
}

class _SubjectScreenState extends State<SubjectScreen> {
  bool _isLoading = true;
  String? _lessonText;
  List<Map<String, dynamic>>? _quizData;
  String? _errorMessage;
  int _currentLevel = 1; // Keep track of the current level

  @override
  void initState() {
    super.initState();
    _fetchCurrentLesson();
  }

  Future<void> _fetchCurrentLesson() async {
    // When we fetch a new lesson, reset the UI to a loading state.
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) throw Exception("No user logged in.");
      
      final userId = user.uid;
      final subjectId = widget.subjectName.toLowerCase();

      final progressDocRef = FirebaseFirestore.instance
          .collection('users').doc(userId).collection('progress').doc(subjectId);
      final progressSnapshot = await progressDocRef.get();
      
      if (!progressSnapshot.exists) throw Exception("Could not find progress.");

      // Store the current level in our state variable
      _currentLevel = progressSnapshot.data()?['currentLevel'] ?? 1;
      final levelId = _currentLevel.toString();
      const topicId = "addition_single_digit";

      final lessonDocSnapshot = await FirebaseFirestore.instance
          .collection('subjects').doc(subjectId).collection('topics').doc(topicId).collection('levels').doc(levelId)
          .get();

      if (lessonDocSnapshot.exists) {
        final data = lessonDocSnapshot.data();
        setState(() {
          _lessonText = data?['lessonText'];
          _quizData = data?['quiz'] is List ? List<Map<String, dynamic>>.from(data?['quiz']) : null;
          _isLoading = false;
        });
      } else {
        // This is a good state - it means the user has finished all available content!
        setState(() {
          _lessonText = "Congratulations! You've completed all the lessons for this topic!";
          _quizData = null; // No quiz if there's no lesson
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = "An error occurred: ${e.toString()}";
        _isLoading = false;
      });
      print("Error fetching lesson: $e");
    }
  }

  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  // NEW FUNCTION: Updates the user's level in Firestore.
  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  Future<void> _levelUp() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final subjectId = widget.subjectName.toLowerCase();
    final progressDocRef = FirebaseFirestore.instance
        .collection('users').doc(user.uid).collection('progress').doc(subjectId);

    // We use FieldValue.increment(1) to safely increase the level number.
    await progressDocRef.update({'currentLevel': FieldValue.increment(1)});

    // After leveling up, fetch the new lesson automatically!
    _fetchCurrentLesson();
  }

  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  // NEW FUNCTION: Handles launching the quiz and getting the result.
  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  Future<void> _launchQuiz() async {
    if (_quizData == null || _quizData!.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("No practice available for this lesson yet!")),
      );
      return;
    }

    // `await` pauses execution until the QuizScreen is "popped".
    // The `passed` variable will hold the true/false value we sent back.
    final bool? passed = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => QuizScreen(quizData: _quizData!),
      ),
    );

    // Check if the user passed the quiz.
    if (passed == true) {
      // If they passed, level them up!
      await _levelUp();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Great job! You've reached the next level!"), backgroundColor: Colors.green),
      );
    } else {
      // If they didn't pass, show an encouraging message.
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Good try! Review the lesson and try again."), backgroundColor: Colors.orange),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text("${widget.subjectName} - Level $_currentLevel"),
        backgroundColor: Colors.brown.shade400,
      ),
      body: Center(child: _buildLessonContent()),
    );
  }

  Widget _buildLessonContent() {
    if (_isLoading) {
      return const CircularProgressIndicator();
    } else if (_errorMessage != null) {
      return Padding(
        padding: const EdgeInsets.all(16.0),
        child: Text(_errorMessage!, style: const TextStyle(color: Colors.red, fontSize: 18), textAlign: TextAlign.center),
      );
    } else if (_lessonText != null) {
      return Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Padding(
            padding: const EdgeInsets.all(24.0),
            child: Text(_lessonText!, style: const TextStyle(fontSize: 24), textAlign: TextAlign.center),
          ),
          const SizedBox(height: 40),
          // Only show the button if there is a quiz for this lesson
          if (_quizData != null)
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 15),
                textStyle: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
              // The button now calls our new _launchQuiz function.
              onPressed: _launchQuiz,
              child: const Text("Let's Practice!"),
            ),
      const SizedBox(height: 20),
      TextButton.icon(
        icon: const Icon(Icons.support_agent),
        label: const Text("Ask for Help"),
        onPressed: () {
          // Navigate to the chat screen, passing the lesson text as context.
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => ChatScreen(lessonContext: _lessonText!),
            ),
          );
        },
      ),
    ],
  );
    } else {
      return const Text("Welcome to your lesson!");
    }
  }
}