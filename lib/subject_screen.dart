// Location: lib/subject_screen.dart

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'quiz_screen.dart';
import 'sound_manager.dart';
import 'textured_button.dart';
import 'chat_screen.dart';

List<String>? _suggestedQuestions;

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
  int _currentTopicIndex = 0; // We still need this for linear subjects

  @override
  void initState() {
    super.initState();
    _fetchCurrentLesson();
  }

  Future<void> _fetchCurrentLesson() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) throw Exception("No user logged in.");

      final subjectId = widget.subjectName.toLowerCase();

      // --- START OF HYBRID LOGIC ---

      // 1. Fetch the main subject document and user progress simultaneously
      final userDocFuture =
          FirebaseFirestore.instance.collection('users').doc(user.uid).get();
      final subjectDocFuture =
          FirebaseFirestore.instance
              .collection('subjects')
              .doc(subjectId)
              .get();

      final userDoc = await userDocFuture;
      final subjectDoc = await subjectDocFuture;

      final progressDocRef = userDoc.reference
          .collection('progress')
          .doc(subjectId);
      final progressSnapshot = await progressDocRef.get();

      if (!progressSnapshot.exists) throw Exception("Could not find progress.");
      _currentLevel = progressSnapshot.data()?['currentLevel'] ?? 1;

      // 2. Check if a topicOrder exists. This is the main decision point.
      final topicOrderData = subjectDoc.data()?['topicOrder'];

      if (topicOrderData != null &&
          topicOrderData is List &&
          topicOrderData.isNotEmpty) {
        // --- PATH A: Linear Curriculum (Math, Reading) ---
        final List<String> topicOrder = List<String>.from(topicOrderData);
        _currentTopicIndex = progressSnapshot.data()?['currentTopicIndex'] ?? 0;

        if (_currentTopicIndex >= topicOrder.length) {
          throw Exception("All ordered topics completed!");
        }
        _currentTopicId = topicOrder[_currentTopicIndex];
      } else {
        // --- PATH B: Non-Linear "Checklist" Curriculum (Science, World) ---
        final List<String> earnedBadges = List<String>.from(
          userDoc.data()?['earnedBadges'] ?? [],
        );
        final topicsSnapshot =
            await subjectDoc.reference.collection('topics').get();

        String? nextTopicId;
        for (final topicDoc in topicsSnapshot.docs) {
          if (!earnedBadges.contains(topicDoc.id)) {
            nextTopicId = topicDoc.id;
            break;
          }
        }
        if (nextTopicId == null)
          throw Exception("All non-linear topics completed!");
        _currentTopicId = nextTopicId;
      }

      // 3. Now that we have the correct topicId, fetch the lesson content
      final levelId = _currentLevel.toString();
      final lessonDocSnapshot =
          await FirebaseFirestore.instance
              .collection('subjects')
              .doc(subjectId)
              .collection('topics')
              .doc(_currentTopicId)
              .collection('levels')
              .doc(levelId)
              .get();

      if (lessonDocSnapshot.exists) {
        final data = lessonDocSnapshot.data();
        setState(() {
          _lessonText = data?['lessonText'];
          _quizData =
              data?['quiz'] is List
                  ? List<Map<String, dynamic>>.from(data?['quiz'])
                  : null;
          if (data?['suggestedQuestions'] is List) {
            _suggestedQuestions = List<String>.from(
              data?['suggestedQuestions'],
            );
          } else {
            _suggestedQuestions = null; // Or an empty list: [];
          }
          _isLoading = false;
        });
      } else {
        // This means the user finished all levels for the current topic, regardless of path
        await _completeTopic();
      }
    } catch (e) {
      // A generic catch-all for "You're all done!" or actual errors
      final message =
          e.toString().contains("completed")
              ? "Wow! You've mastered all the topics in ${widget.subjectName}!"
              : "An error occurred. Please try again.";
      setState(() {
        _lessonText = message;
        _quizData = null;
        _isLoading = false;
      });
      print("Flow ended or error occurred: $e");
    }
  }

  // This function now handles completing ANY topic
  Future<void> _completeTopic() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    // Award the badge for the topic they just finished
    final userDocRef = FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid);
    await userDocRef.update({
      'earnedBadges': FieldValue.arrayUnion([_currentTopicId]),
    });
    print("Awarded badge for topic: $_currentTopicId");

    // Reset their level to 1 and check if we need to increment the topic index
    final subjectId = widget.subjectName.toLowerCase();
    final progressDocRef = userDocRef.collection('progress').doc(subjectId);

    // Check if the subject was linear to decide whether to increment the index
    final subjectDoc =
        await FirebaseFirestore.instance
            .collection('subjects')
            .doc(subjectId)
            .get();
    if (subjectDoc.data()?['topicOrder'] != null) {
      await progressDocRef.update({
        'currentTopicIndex': FieldValue.increment(1),
        'currentLevel': 1,
      });
    } else {
      await progressDocRef.update({'currentLevel': 1});
    }

    _fetchCurrentLesson();
  }

  // This function now just increments the level
  Future<void> _levelUp() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final subjectId = widget.subjectName.toLowerCase();
    final progressDocRef = FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .collection('progress')
        .doc(subjectId);

    await progressDocRef.update({'currentLevel': FieldValue.increment(1)});
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
      SoundManager.playLevelUpSound();
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

  // This is the build method, now at the correct level.
  @override
  Widget build(BuildContext context) {
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
                image: AssetImage("assets/images/main_background.png"),
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

  // This is the _buildLessonContent method, now at the correct level.
  Widget _buildLessonContent() {
    if (_isLoading) {
      return const CircularProgressIndicator();
    } else if (_errorMessage != null) {
      return Padding(
        padding: const EdgeInsets.all(16.0),
        child: Text(
          _errorMessage!,
          style: const TextStyle(color: Colors.red, fontSize: 18),
          textAlign: TextAlign.center,
        ),
      );
    } else if (_lessonText != null) {
      return Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Padding(
            padding: const EdgeInsets.all(24.0),
            child: Text(
              _lessonText!,
              style: const TextStyle(
                fontSize: 24,
                color: Colors.white,
                shadows: [Shadow(blurRadius: 2, color: Colors.black87)],
              ),
              textAlign: TextAlign.center,
            ),
          ),
          const SizedBox(height: 40),
          if (_quizData != null)
            TexturedButton(
              text: "Let's Practice!",
              onPressed: _launchQuiz,
              texture: ButtonTexture.wood, // Example: use wood texture
              fontSize: 20,
              fixedSize: const Size(400, 100),
              padding: const EdgeInsets.symmetric(vertical: 8.0),
            ),

          const SizedBox(height: 20), // Or adjust spacing as needed
          TextButton.icon(
            icon: const Icon(
              Icons.support_agent,
              color: Colors.white,
            ), // Make icon visible
            label: const Text(
              "Ask for Help",
              style: TextStyle(color: Colors.white),
            ), // Make text visible
            onPressed: () {
              SoundManager.playClickSound();
              if (_lessonText != null && _lessonText!.isNotEmpty) {
                // Ensure there's context
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder:
                        (context) => ChatScreen(
                          lessonContext: _lessonText!,
                          suggestedQuestions: _suggestedQuestions,
                        ),
                  ),
                );
              } else {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text("No lesson loaded to ask about!"),
                  ),
                );
              }
            },
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              // Add a subtle background or shape if it's hard to see on your background
              // backgroundColor: Colors.black.withOpacity(0.2),
              // shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
          ),
        ],
      );
    } else {
      return const Text("Welcome to your lesson!");
    }
  }
}
