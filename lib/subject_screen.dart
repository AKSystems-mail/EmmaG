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
  int _currentTopicIndex = 0;

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

      final subjectDoc = await FirebaseFirestore.instance.collection('subjects').doc(subjectId).get();
      if (!subjectDoc.exists || subjectDoc.data()?['topicOrder'] == null) {
        throw Exception("Curriculum not found for this subject.");
      }
      final List<String> topicOrder = List<String>.from(subjectDoc.data()!['topicOrder']);

      final progressDocRef = FirebaseFirestore.instance.collection('users').doc(user.uid).collection('progress').doc(subjectId);
      final progressSnapshot = await progressDocRef.get();
      if (!progressSnapshot.exists) throw Exception("Could not find progress.");

      _currentTopicIndex = progressSnapshot.data()?['currentTopicIndex'] ?? 0;
      _currentLevel = progressSnapshot.data()?['currentLevel'] ?? 1;

      if (_currentTopicIndex >= topicOrder.length) {
        setState(() {
          _lessonText = "Wow! You've mastered all the topics in ${widget.subjectName}!";
          _quizData = null;
          _isLoading = false;
        });
        return;
      }

      final topicId = topicOrder[_currentTopicIndex];
      final levelId = _currentLevel.toString();

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
        await _levelUp(isTopicFinished: true);
      }
    } catch (e) {
      setState(() { _errorMessage = "An error occurred: ${e.toString()}"; _isLoading = false; });
      print("Error fetching lesson: $e");
    }
  }

  // This is the _levelUp function. It is now at the correct indentation level.
  Future<void> _levelUp({bool isTopicFinished = false}) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final subjectId = widget.subjectName.toLowerCase();
    final progressDocRef = FirebaseFirestore.instance
        .collection('users').doc(user.uid).collection('progress').doc(subjectId);

    if (isTopicFinished) {
      try {
        final subjectDoc = await FirebaseFirestore.instance.collection('subjects').doc(subjectId).get();
        final topicOrder = List<String>.from(subjectDoc.data()!['topicOrder']);
        final finishedTopicId = topicOrder[_currentTopicIndex];

        final userDocRef = FirebaseFirestore.instance.collection('users').doc(user.uid);
        await userDocRef.update({
          'earnedBadges': FieldValue.arrayUnion([finishedTopicId])
        });
        print("Awarded badge for topic: $finishedTopicId");
      } catch (e) {
        print("Error awarding badge: $e");
      }

      await progressDocRef.update({
        'currentTopicIndex': FieldValue.increment(1),
        'currentLevel': 1,
      });
    } else {
      await progressDocRef.update({'currentLevel': FieldValue.increment(1)});
    }
    
    _fetchCurrentLesson();
  }

  // This is the _launchQuiz function, now at the correct level.
  Future<void> _launchQuiz() async {
    if (_quizData == null || _quizData!.isEmpty) return;

    final bool? passed = await Navigator.push(
      context,
      MaterialPageRoute(builder: (context) => QuizScreen(quizData: _quizData!)),
    );

    if (passed == true) {
      await _levelUp();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Great job! You've reached the next level!"), backgroundColor: Colors.green),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Good try! Review the lesson and try again."), backgroundColor: Colors.orange),
      );
    }
  }

  // This is the build method, now at the correct level.
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

  // This is the _buildLessonContent method, now at the correct level.
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