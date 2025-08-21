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
import 'sound_back_button.dart';

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
  String? _topicName;
  List<String>? _suggestedQuestions;

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

      final userDoc =
          await FirebaseFirestore.instance
              .collection('users')
              .doc(user.uid)
              .get();
      final subjectDoc =
          await FirebaseFirestore.instance
              .collection('subjects')
              .doc(subjectId)
              .get();
      final progressSnapshot =
          await userDoc.reference.collection('progress').doc(subjectId).get();

      if (!progressSnapshot.exists) throw Exception("Could not find progress.");
      _currentLevel = progressSnapshot.data()?['currentLevel'] ?? 1;

      final topicOrderData = subjectDoc.data()?['topicOrder'];

      if (topicOrderData != null &&
          topicOrderData is List &&
          topicOrderData.isNotEmpty) {
        final List<String> topicOrder = List<String>.from(topicOrderData);
        _currentTopicIndex = progressSnapshot.data()?['currentTopicIndex'] ?? 0;
        if (_currentTopicIndex >= topicOrder.length)
          throw Exception("All ordered topics completed!");
        _currentTopicId = topicOrder[_currentTopicIndex];
      } else {
        final topicsSnapshot =
            await subjectDoc.reference.collection('topics').get();
        final allTopicIds = topicsSnapshot.docs.map((doc) => doc.id).toList();
        final List<String> completedTopics = List<String>.from(
          progressSnapshot.data()?['completedTopics'] ?? [],
        );
        final availableTopics =
            allTopicIds
                .where((topicId) => !completedTopics.contains(topicId))
                .toList();
        if (availableTopics.isEmpty)
          throw Exception("All non-linear topics completed!");
        _currentTopicId = availableTopics.first;
      }

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
          if (data != null) {
            _lessonText = data['lessonText'];
            _quizData =
                data['quiz'] is List
                    ? List<Map<String, dynamic>>.from(data['quiz'])
                    : null;
            _suggestedQuestions =
                data['suggestedQuestions'] is List
                    ? List<String>.from(data['suggestedQuestions'])
                    : null;
            _topicName = data['topicName'];
          } else {
            _lessonText = "Lesson content is empty.";
          }
          _isLoading = false;
        });
      } else {
        await _completeTopic();
      }
    } catch (e) {
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
      final userDocRef = FirebaseFirestore.instance
          .collection('users')
          .doc(user.uid);
      await userDocRef.update({
        'earnedBadges': FieldValue.arrayUnion([_currentTopicId]),
      });
      print("Awarded badge for topic: $_currentTopicId");

      // 2. Fetch the details of the badge that was just awarded.
      final badgeDoc =
          await FirebaseFirestore.instance
              .collection('badges')
              .doc(_currentTopicId)
              .get();
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
            MaterialPageRoute(
              builder: (context) => BadgeAwardScreen(badge: badge),
            ),
          );
        }
      }
    } catch (e) {
      print("Error during badge award/display flow: $e");
    }

    // 4. AFTER the badge screen is closed, update the progress for the next topic.
    final subjectId = widget.subjectName.toLowerCase();
    final progressDocRef = FirebaseFirestore.instance
        .collection('users')
        .doc(user.uid)
        .collection('progress')
        .doc(subjectId);

    await progressDocRef.update({
      'completedTopics': FieldValue.arrayUnion([_currentTopicId]),
    });
    await progressDocRef.update({'currentLevel': 1});

    final subjectDoc =
        await FirebaseFirestore.instance
            .collection('subjects')
            .doc(subjectId)
            .get();
    if (subjectDoc.data()?['topicOrder'] != null) {
      await progressDocRef.update({
        'currentTopicIndex': FieldValue.increment(1),
      });
    }

    // 5. Fetch the next lesson.
    _fetchCurrentLesson();
  }

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

   Future<void> _launchQuiz() async {
    if (_quizData == null || _quizData!.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("No practice available for this lesson yet!")),
      );
      return;
    }

    try {
      // 1. Get a reference to the levels collection for the current topic.
      final subjectId = widget.subjectName.toLowerCase();
      final levelsCollectionRef = FirebaseFirestore.instance
          .collection('subjects').doc(subjectId)
          .collection('topics').doc(_currentTopicId)
          .collection('levels');

      // 2. Get all the documents in that collection to count them.
      final levelsSnapshot = await levelsCollectionRef.get();
      final totalLevelsInTopic = levelsSnapshot.docs.length;

      if (totalLevelsInTopic == 0) {
        throw Exception("No levels found for this topic.");
      }

      // 3. Navigate to the QuizScreen, now with all the data it needs.
      //    We only declare 'passed' once.
      final bool? passed = await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => QuizScreen(
            quizData: _quizData!,
            topicName: _topicName ?? widget.subjectName,
            currentLevel: _currentLevel,
            totalLevelsInTopic: totalLevelsInTopic,
          ),
        ),
      );

      // 4. Handle the result after the quiz screen is closed.
      if (passed == true) {
        await _levelUp();
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
    } catch (e) {
      print("Error launching quiz: $e");
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Could not start the quiz. Please try again.")),
      );
    }
  }


  @override
  void dispose() {
    // Stop any speech when the screen is disposed
    SoundManager.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // This build method is correct and does not need changes.
    return Scaffold(
      appBar: AppBar(
        leading: const SoundBackButton(color: Colors.black),
        title: Text("${widget.subjectName} - Level $_currentLevel"),
        backgroundColor: Colors.green.shade700,
      ),
      body: Stack(
        children: [
          Container(
            decoration: const BoxDecoration(
              image: DecorationImage(
                image: AssetImage(
                  "assets/images/subject_screen_background.png",
                ),
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

  // In lib/subject_screen.dart, inside the _SubjectScreenState class

  // Replace your existing _buildLessonContent method with this one.
  Widget _buildLessonContent() {
    if (_isLoading) {
      return const CircularProgressIndicator(color: Colors.white);
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
          // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
          // THE NEW, ROBUST LAYOUT FOR THE LESSON AREA
          // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
          Padding(
            // Add horizontal padding to the whole content block
            padding: const EdgeInsets.symmetric(horizontal: 24.0),
            child: Column(
              // Use min to make the column only as tall as its children
              mainAxisSize: MainAxisSize.min,
              children: [
                // 1. The Speaker Icon, aligned to the right
                Align(
                  alignment: Alignment.centerRight,
                  child: IconButton(
                    icon: Image.asset("assets/images/speaker_icon.png"),
                    iconSize: 36,
                    onPressed: () {
                      SoundManager.speak(_lessonText!);
                    },
                  ),
                ),
                // 2. A small, fixed space between the icon and the text
                const SizedBox(height: 8),
                // 3. The Lesson Text, which will always be centered
                Text(
                  _lessonText!,
                  style: const TextStyle(
                    fontSize: 24,
                    color: Colors.white,
                    shadows: [Shadow(blurRadius: 2, color: Colors.black87)],
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
          const SizedBox(height: 40),
          // The rest of your buttons are unchanged and will work perfectly.
          if (_quizData != null)
            TexturedButton(
              text: "Let's Practice!",
              onPressed: _launchQuiz,
              texture: ButtonTexture.wood,
              fontSize: 20,
              fixedSize: const Size(280, 70),
            ),
          const SizedBox(height: 20),
          TextButton.icon(
            icon: const Icon(Icons.auto_stories_sharp, color: Colors.white),
            label: const Text(
              "Ask For Help",
              style: TextStyle(color: Colors.white),
            ),
            onPressed: () {
              SoundManager.playClickSound();
              if (_lessonText != null && _topicName != null) {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder:
                        (context) => ChatScreen(
                          lessonContext: _lessonText!,
                          topicName: _topicName!,
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
          ),
        ],
      );
    } else {
      return const Text("Welcome to your lesson!");
    }
  }
}
