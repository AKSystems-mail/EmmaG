// Location: lib/subject_screen.dart

import 'package:flutter/material.dart';
// ADD THIS IMPORT to get access to Firestore.
import 'package:cloud_firestore/cloud_firestore.dart';

// 1. We've converted the widget to a StatefulWidget.
class SubjectScreen extends StatefulWidget {
  final String subjectName;

  const SubjectScreen({super.key, required this.subjectName});

  @override
  State<SubjectScreen> createState() => _SubjectScreenState();
}

// This is the "State" object for our widget.
class _SubjectScreenState extends State<SubjectScreen> {
  // 2. We add state variables to hold our data and track the loading status.
  bool _isLoading = true;
  String? _lessonText;
  String? _errorMessage;

  // 3. This method runs once when the screen is first created.
  @override
  void initState() {
    super.initState();
    _fetchFirstLesson(); // We call our data-fetching function here.
  }

  // 4. This is the new function that talks to Firestore.
  Future<void> _fetchFirstLesson() async {
    try {
      // We build the path to the document based on the subject name.
      // For now, we hardcode the topic and level for this first test.
      final subjectId = widget.subjectName.toLowerCase();
      const topicId = "addition_single_digit";
      const levelId = "1";

      final docSnapshot = await FirebaseFirestore.instance
          .collection('subjects')
          .doc(subjectId)
          .collection('topics')
          .doc(topicId)
          .collection('levels')
          .doc(levelId)
          .get();

      // Check if the document actually exists in Firestore.
      if (docSnapshot.exists) {
        // If it exists, update our state with the lesson text.
        setState(() {
          _lessonText = docSnapshot.data()?['lessonText'];
          _isLoading = false; // Stop the loading spinner
        });
      } else {
        // If it doesn't exist, set an error message.
        setState(() {
          _errorMessage = "Oh no! We couldn't find that lesson.";
          _isLoading = false;
        });
      }
    } catch (e) {
      // If any other error happens (like no internet), set an error message.
      setState(() {
        _errorMessage = "An error occurred. Please try again.";
        _isLoading = false;
      });
      print("Firestore Error: $e"); // Print the actual error to the console for debugging.
    }
  }

  // 5. The build method now displays the UI based on our state variables.
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.subjectName),
        backgroundColor: Colors.brown.shade400,
      ),
      body: Center(
        child: _buildLessonContent(),
      ),
    );
  }

  // This helper widget decides what to show: a spinner, an error, or the lesson.
  Widget _buildLessonContent() {
    if (_isLoading) {
      // If we're still loading, show a spinner.
      return const CircularProgressIndicator();
    } else if (_errorMessage != null) {
      // If there was an error, show the error message.
      return Text(_errorMessage!, style: const TextStyle(color: Colors.red, fontSize: 18));
    } else if (_lessonText != null) {
      // If loading is complete and we have lesson text, show it!
      return Padding(
        padding: const EdgeInsets.all(24.0),
        child: Text(
          _lessonText!,
          style: const TextStyle(fontSize: 24),
          textAlign: TextAlign.center,
        ),
      );
    } else {
      // A fallback just in case something unexpected happens.
      return const Text("Welcome to your lesson!");
    }
  }
}