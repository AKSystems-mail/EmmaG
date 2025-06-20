// Location: lib/subject_screen.dart

import 'package:flutter/material.dart' hide Badge;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'quiz_screen.dart';
import 'sound_manager.dart';
import 'textured_button.dart';
import 'chat_screen.dart';
import 'badge_award_screen.dart'; // Make sure this import is here
import 'badges_screen.dart'; // We need this for the Badge data class

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
  String _currentTopicId = '';
  int _currentTopicIndex = 0;
  List<String>? _suggestedQuestions;

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

      final userDoc = await FirebaseFirestore.instance.collection('users').doc(user.uid).get();
      final subjectDoc = await FirebaseFirestore.instance.collection('subjects').doc(subjectId).get();
      final progressSnapshot = await userDoc.reference.collection('progress').doc(subjectId).get();
      
      if (!progressSnapshot.exists) throw Exception("Could not find progress.");
      _currentLevel = progressSnapshot.data()?['currentLevel'] ?? 1;

      final topicOrderData = subjectDoc.data()?['topicOrder'];
      
      if (topicOrderData != null && topicOrderData is List && topicOrderData.isNotEmpty) {
        final List<String> topicOrder = List<String>.from(topicOrderData);
        _currentTopicIndex = progressSnapshot.data()?['currentTopicIndex'] ?? 0;
        if (_currentTopicIndex >= topicOrder.length) throw Exception("All ordered topics completed!");
        _currentTopicId = topicOrder[_currentTopicIndex];
      } else {
        final topicsSnapshot = await subjectDoc.reference.collection('topics').get();
        final allTopicIds = topicsSnapshot.docs.map((doc) => doc.id).toList();
        final List<String> completedTopics = List<String>.from(progressSnapshot.data()?['completedTopics'] ?? []);
        final availableTopics = allTopicIds.where((topicId) => !completedTopics.contains(topicId)).toList();
        if (availableTopics.isEmpty) throw Exception("All non-linear topics completed!");
        _currentTopicId = availableTopics.first;
      }

      final levelId = _currentLevel.toString();
      final lessonDocSnapshot = await FirebaseFirestore.instance
          .collection('subjects').doc(subjectId).collection('topics').doc(_currentTopicId).collection('levels').doc(levelId)
          .get();

      if (lessonDocSnapshot.exists) {
        final data = lessonDocSnapshot.data();
        setState(() {
          if (data != null) {
            _lessonText = data['lessonText'];
            _quizData = data['quiz'] is List ? List<Map<String, dynamic>>.from(data['quiz']) : null;
            _suggestedQuestions = data['suggestedQuestions'] is List ? List<String>.from(data['suggestedQuestions']) : null;
          } else {
            _lessonText = "Lesson content is empty.";
          }
          _isLoading = false;
        });
      } else {
        await _completeTopic();
      }
    } catch (e) {
      final message = e.toString().contains("completed") 
          ? "Wow! You've mastered all the topics in ${widget.subjectName}!"
          : "An error occurred. Please try again.";
      setState(() { _lessonText = message; _quizData = null; _isLoading = false; });
      print("Flow ended or error occurred: $e");
    }
  }

  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  // THE CORRECTED _completeTopic FUNCTION
  // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  Future<void> _completeTopic() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;
    if (_currentTopicId.isEmpty) {
      print("Error: Tried to complete a topic with an empty ID. Aborting.");
      setState(() {
        _errorMessage = "Something went wrong, please go back and try again.";
        _isLoading = false;
      });
      return; // Stop execution here
    }

    try {
      // 1. Award the badge ID to the user's profile.
      final userDocRef = FirebaseFirestore.instance.collection('users').doc(user.uid);
      await userDocRef.update({
        'earnedBadges': FieldValue.arrayUnion([_currentTopicId])
      });
      print("Awarded badge for topic: $_currentTopicId");

      // 2. Fetch the details of the badge that was just awarded.
      final badgeDoc = await FirebaseFirestore.instance.collection('badges').doc(_currentTopicId).get();
      if (badgeDoc.exists) {
        final badge = Badge(
          id: badgeDoc.id,
          name: badgeDoc.data()?['name'] ?? 'New Badge!',
          imageUrl: badgeDoc.data()?['imageUrl'] ?? '',
        );

        // 3. Navigate to the BadgeAwardScreen and WAIT for it to close.
        if (mounted) {
          await Navigator.push(
            context,
            MaterialPageRoute(builder: (context) => BadgeAwardScreen(badge: badge)),
          );
        }
      }
    } catch (e) {
      print("Error during badge award/display flow: $e");
    }

    // 4. AFTER the badge screen is closed, update the progress for the next topic.
    final subjectId = widget.subjectName.toLowerCase();
    final progressDocRef = FirebaseFirestore.instance.collection('users').doc(user.uid).collection('progress').doc(subjectId);
    
    await progressDocRef.update({
      'completedTopics': FieldValue.arrayUnion([_currentTopicId])
    });
    await progressDocRef.update({'currentLevel': 1});

    final subjectDoc = await FirebaseFirestore.instance.collection('subjects').doc(subjectId).get();
    if (subjectDoc.data()?['topicOrder'] != null) {
      await progressDocRef.update({'currentTopicIndex': FieldValue.increment(1)});
    }

    // 5. Fetch the next lesson.
    _fetchCurrentLesson();
  }

  Future<void> _levelUp() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final subjectId = widget.subjectName.toLowerCase();
    final progressDocRef = FirebaseFirestore.instance
        .collection('users').doc(user.uid).collection('progress').doc(subjectId);

    await progressDocRef.update({'currentLevel': FieldValue.increment(1)});
    _fetchCurrentLesson();
  }

  Future<void> _launchQuiz() async {
    if (_quizData == null || _quizData!.isEmpty) return;

    final bool? passed = await Navigator.push(
      context,
      MaterialPageRoute(builder: (context) => QuizScreen(quizData: _quizData!)),
    );

    if (passed == true) {
      // NOTE: We call _levelUp() here, which just increments the level.
      // The _fetchCurrentLesson() inside _levelUp will handle detecting if a topic is finished.
      await _levelUp(); 
      // The level up sound is now part of the BadgeAwardScreen, so we can remove it from here
      // to avoid playing it twice.
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Great job! You've reached the next level!"),
          backgroundColor: Colors.green,
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Good try! Review the lesson and try again."),
          backgroundColor: Colors.orange,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    // This build method is correct and does not need changes.
    return Scaffold(
      appBar: AppBar(
        title: Text("${widget.subjectName} - Level $_currentLevel"),
        backgroundColor: Colors.green.shade700,
      ),
      body: Stack(
        children: [
          Container(
            decoration: const BoxDecoration(
              image: DecorationImage(
                image: AssetImage("assets/images/subject_screen_background.png"),
                fit: BoxFit.cover,
              ),
            ),
          ),
          Container(color: Colors.black.withOpacity(0.4)),
          Center(child: _buildLessonContent()),
        ],
      ),
    );
  }

  Widget _buildLessonContent() {
    // This _buildLessonContent method is correct and does not need changes.
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
            child: Text(
              _lessonText!,
              style: const TextStyle(fontSize: 24, color: Colors.white, shadows: [Shadow(blurRadius: 2, color: Colors.black87)]),
              textAlign: TextAlign.center,
            ),
          ),
          const SizedBox(height: 40),
          if (_quizData != null)
            TexturedButton(
              text: "Let's Practice!",
              onPressed: _launchQuiz,
              texture: ButtonTexture.wood,
              fontSize: 20,
              fixedSize: const Size(280, 70), // Adjusted size for better look
            ),
          const SizedBox(height: 20),
          TextButton.icon(
            icon: const Icon(Icons.support_agent, color: Colors.white),
            label: const Text("Ask for Help", style: TextStyle(color: Colors.white)),
            onPressed: () {
              SoundManager.playClickSound();
              if (_lessonText != null && _lessonText!.isNotEmpty) {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => ChatScreen(
                      lessonContext: _lessonText!,
                      suggestedQuestions: _suggestedQuestions,
                    ),
                  ),
                );
              } else {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text("No lesson loaded to ask about!")),
                );
              }
            },
          ),
        ],
      );
    } else {
      return const Text("Welcome to your lesson!");
    }
  }
}