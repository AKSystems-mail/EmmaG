// Location: lib/subject_screen.dart

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'quiz_screen.dart';

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
  int _currentLevel = 1;
  int _currentTopicIndex = 0; // ADDED: State for the topic index

  @override
  void initState() {
    super.initState();
    _fetchCurrentLesson();
  }

  Future<void> _fetchCurrentLesson() async {
    setState(() { _isLoading = true; _errorMessage = null; });

    try {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) throw Exception("No user logged in.");
      
      final subjectId = widget.subjectName.toLowerCase();

      // 1. Fetch the Curriculum Map (the topic order)
      final subjectDoc = await FirebaseFirestore.instance.collection('subjects').doc(subjectId).get();
      if (!subjectDoc.exists || subjectDoc.data()?['topicOrder'] == null) {
        throw Exception("Curriculum not found for this subject.");
      }
      final List<String> topicOrder = List<String>.from(subjectDoc.data()!['topicOrder']);

      // 2. Fetch the user's progress
      final progressDocRef = FirebaseFirestore.instance.collection('users').doc(user.uid).collection('progress').doc(subjectId);
      final progressSnapshot = await progressDocRef.get();
      if (!progressSnapshot.exists) throw Exception("Could not find progress.");

      // 3. Determine the current topic and level
      _currentTopicIndex = progressSnapshot.data()?['currentTopicIndex'] ?? 0;
      _currentLevel = progressSnapshot.data()?['currentLevel'] ?? 1;

      if (_currentTopicIndex >= topicOrder.length) {
        // User has finished all topics for this subject!
        setState(() {
          _lessonText = "Wow! You've mastered all the topics in ${widget.subjectName}!";
          _quizData = null;
          _isLoading = false;
        });
        return;
      }

      final topicId = topicOrder[_currentTopicIndex];
      final levelId = _currentLevel.toString();

      // 4. Fetch the specific lesson content
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
        // This now means the user has finished all levels for the CURRENT topic.
        // We trigger a level up, which will move them to the next topic.
        await _levelUp(isTopicFinished: true);
      }
    } catch (e) {
      setState(() { _errorMessage = "An error occurred: ${e.toString()}"; _isLoading = false; });
      print("Error fetching lesson: $e");
    }
  }

  // UPDATED: The level up logic is now much smarter
  Future<void> _levelUp({bool isTopicFinished = false}) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final subjectId = widget.subjectName.toLowerCase();
    final progressDocRef = FirebaseFirestore.instance
        .collection('users').doc(user.uid).collection('progress').doc(subjectId);

    if (isTopicFinished) {
      // If the topic is finished, increment the topic index and reset the level to 1
      await progressDocRef.update({
        'currentTopicIndex': FieldValue.increment(1),
        'currentLevel': 1,
      });
    } else {
      // Otherwise, just increment the level
      await progressDocRef.update({'currentLevel': FieldValue.increment(1)});
    }
    
    // After leveling up, fetch the new lesson automatically!
    _fetchCurrentLesson();
  }

  Future<void> _launchQuiz() async {
    if (_quizData == null || _quizData!.isEmpty) return;

    final bool? passed = await Navigator.push(
      context,
      MaterialPageRoute(builder: (context) => QuizScreen(quizData: _quizData!)),
    );

    if (passed == true) {
      await _levelUp(); // Call the regular level up
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Great job! You've reached the next level!"), backgroundColor: Colors.green),
      );
    } else {
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
          if (_quizData != null)
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 15),
                textStyle: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
              ),
              onPressed: _launchQuiz,
              child: const Text("Let's Practice!"),
            ),
        ],
      );
    } else {
      return const Text("Welcome to your lesson!");
    }
  }
}