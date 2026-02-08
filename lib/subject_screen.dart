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

// Define a simple class to hold slide data
class LessonSlide {
  final String text;
  final String? imagePrompt;
  final String? localImagePath;
  final Map<String, String> keywords;

  LessonSlide({
    required this.text,
    this.imagePrompt,
    this.localImagePath,
    required this.keywords,
  });

  factory LessonSlide.fromJson(Map<String, dynamic> json) {
    return LessonSlide(
      text: json['text'] ?? '',
      imagePrompt: json['imagePrompt'],
      localImagePath: json['localImagePath'],
      keywords: Map<String, String>.from(json['keywords'] ?? {}),
    );
  }
}

// Define a simple class to hold lesson data
class LessonInfo {
  final String topicId;
  final int level;
  final List<LessonSlide> slides;

  LessonInfo({required this.topicId, required this.level, required this.slides});

  String get id => "${topicId}_$level"; // Unique ID for caching
}

class SubjectScreen extends StatefulWidget {
  final String subjectName;
  const SubjectScreen({super.key, required this.subjectName});

  @override
  State<SubjectScreen> createState() => _SubjectScreenState();
}

class _SubjectScreenState extends State<SubjectScreen> {
  bool _isLoading = true;
  List<LessonSlide> _slides = [];
  int _currentSlideIndex = 0;
  final PageController _pageController = PageController();
  
  List<Map<String, dynamic>>? _quizData;
  String? _errorMessage;
  int _currentLevel = 1;
  String _currentTopicId = '';
  int _currentTopicIndex = 0;
  String? _topicName;
  List<String>? _suggestedQuestions;
  bool _showIntroduction = false;
  LessonSlide? _introSlide;

  List<String> _allTopicIds = []; // Stores all topic IDs for the current subject
  List<String> _topicOrder = []; // Stores the ordered topics if available
  List<String> _completedTopics = []; // Stores the user's completed topics

  // Helper to generate a unique ID for each lesson for caching
  String _getLessonId(String topicId, int level) {
    return "${widget.subjectName.toLowerCase()}_${topicId}_$level";
  }

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

      // Populate new state variables
      _topicOrder = List<String>.from(subjectDoc.data()?['topicOrder'] ?? []);
      final topicsSnapshot = await subjectDoc.reference.collection('topics').get();
      _allTopicIds = topicsSnapshot.docs.map((doc) => doc.id).toList();
      _completedTopics = List<String>.from(progressSnapshot.data()?['completedTopics'] ?? []);


      if (_topicOrder.isNotEmpty) {
        _currentTopicIndex = progressSnapshot.data()?['currentTopicIndex'] ?? 0;
        if (_currentTopicIndex >= _topicOrder.length)
          throw Exception("All ordered topics completed!");
        _currentTopicId = _topicOrder[_currentTopicIndex];
      } else {
        final availableTopics =
            _allTopicIds
                .where((topicId) => !_completedTopics.contains(topicId))
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
            // Handle legacy data (string) or new data (list of slides)
            if (data['slides'] is List) {
              _slides = (data['slides'] as List)
                  .map((s) => LessonSlide.fromJson(s))
                  .toList();
            } else if (data['lessonText'] is String) {
              // Legacy support: Wrap old text in a single slide
              _slides = [
                LessonSlide(
                  text: data['lessonText'],
                  keywords: {},
                )
              ];
            }

            _quizData =
                data['quiz'] is List
                    ? List<Map<String, dynamic>>.from(data['quiz'])
                    : null;
            _suggestedQuestions =
                data['suggestedQuestions'] is List
                    ? List<String>.from(data['suggestedQuestions'])
                    : null;
            _topicName = data['topicName'];
            _currentSlideIndex = 0;

            // Check if we should show the introduction
            if (_currentLevel == 1) {
              _showIntroduction = true;
              if (data['introduction'] != null) {
                _introSlide = LessonSlide.fromJson(data['introduction']);
              } else {
                // Default if no intro provided in Firestore yet
                _introSlide = LessonSlide(
                  text: "Welcome to $_topicName! Let's learn something new together.",
                  keywords: {},
                );
              }
            } else {
              _showIntroduction = false;
            }
          } else {
            _slides = [LessonSlide(text: "Lesson content is empty.", keywords: {})];
          }
          _isLoading = false;
        });
        _performPreFetching(); // Call pre-fetching after current lesson is loaded
      } else {
        await _completeTopic();
      }
    } catch (e) {
      final message =
          e.toString().contains("completed")
              ? "Wow! You've mastered all the topics in ${widget.subjectName}!"
              : "An error occurred. Please try again.";
      setState(() {
        _slides = [LessonSlide(text: message, keywords: {})];
        _quizData = null;
        _isLoading = false;
      });
      print("Flow ended or error occurred: $e");
    }
  }

  Future<void> _performPreFetching() async {
    print("AUDIO_CACHE: Starting pre-fetch process...");
    final subjectId = widget.subjectName.toLowerCase();
    List<LessonInfo> allLessonsInSubject = [];

    // 1. Get all topics and their levels for the current subject
    for (String topicId in _allTopicIds) {
      final levelsSnapshot = await FirebaseFirestore.instance
          .collection('subjects')
          .doc(subjectId)
          .collection('topics')
          .doc(topicId)
          .collection('levels')
          .get();

      for (var levelDoc in levelsSnapshot.docs) {
        final level = int.parse(levelDoc.id);
        final data = levelDoc.data();
        List<LessonSlide> slides = [];
        
        if (data['slides'] is List) {
          slides = (data['slides'] as List).map((s) => LessonSlide.fromJson(s)).toList();
        } else if (data['lessonText'] is String) {
          slides = [LessonSlide(text: data['lessonText'], keywords: {})];
        }

        if (slides.isNotEmpty) {
          allLessonsInSubject.add(LessonInfo(topicId: topicId, level: level, slides: slides));
        }
      }
    }
    // ... (sorting and identifying lessons remains same)
    
    // Sort lessons by topic order and then by level
    allLessonsInSubject.sort((a, b) {
      int topicIndexA = _topicOrder.indexOf(a.topicId);
      int topicIndexB = _topicOrder.indexOf(b.topicId);

      if (topicIndexA != topicIndexB) {
        if (_topicOrder.isNotEmpty) {
          return topicIndexA.compareTo(topicIndexB);
        } else {
          return a.topicId.compareTo(b.topicId);
        }
      }
      return a.level.compareTo(b.level);
    });

    // 2. Filter uncompleted lessons and identify the current lesson's index
    List<LessonInfo> uncompletedLessons = [];
    int currentLessonIndex = -1;

    for (int i = 0; i < allLessonsInSubject.length; i++) {
      final lesson = allLessonsInSubject[i];
      bool isTopicCompleted = _completedTopics.contains(lesson.topicId);
      bool isLevelCompletedForCurrentTopic = (lesson.topicId == _currentTopicId && lesson.level < _currentLevel);

      if (!isTopicCompleted && !isLevelCompletedForCurrentTopic) {
        uncompletedLessons.add(lesson);
        if (lesson.topicId == _currentTopicId && lesson.level == _currentLevel) {
          currentLessonIndex = uncompletedLessons.length - 1;
        }
      }
    }

    // 3. Identify the next 3 lessons to pre-fetch
    if (currentLessonIndex != -1) {
      for (int i = 0; i < 3; i++) {
        int preFetchIndex = currentLessonIndex + i;
        if (preFetchIndex < uncompletedLessons.length) {
          final lesson = uncompletedLessons[preFetchIndex];
          // Pre-fetch audio for every slide in these lessons
          for (int sIdx = 0; sIdx < lesson.slides.length; sIdx++) {
            SoundManager.preFetchSpeech(
              lesson.slides[sIdx].text, 
              "${_getLessonId(lesson.topicId, lesson.level)}_slide$sIdx"
            );
          }
        }
      }
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

    print("AUDIO_CACHE: Completing topic: $_currentTopicId");


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

    // Clear cached audio for the completed topic's levels
    final levelsSnapshot = await FirebaseFirestore.instance
        .collection('subjects')
        .doc(subjectId)
        .collection('topics')
        .doc(_currentTopicId)
        .collection('levels')
        .get();
    for (var levelDoc in levelsSnapshot.docs) {
      final lessonId = _getLessonId(_currentTopicId, int.parse(levelDoc.id));
      print("AUDIO_CACHE: Clearing audio for completed topic lesson slides: $lessonId");
      for (int i = 0; i < 5; i++) {
        SoundManager.clearCachedAudio("${lessonId}_slide$i");
      }
    }

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

    // Clear cached audio for the completed level's slides
    final lessonId = _getLessonId(_currentTopicId, _currentLevel);
    print("AUDIO_CACHE: Leveling up. Clearing audio for completed lesson slides: $lessonId");
    for (int i = 0; i < 5; i++) {
      SoundManager.clearCachedAudio("${lessonId}_slide$i");
    }

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
            subjectName: widget.subjectName,
            topicId: _currentTopicId,
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
    Color appBarColor;
    Color textColor = Colors.white;

    switch (widget.subjectName.toLowerCase()) {
      case 'math':
        appBarColor = const Color(0xFFE53935); // Muted Red
        textColor = Colors.white;
        break;
      case 'science':
        appBarColor = const Color(0xFFFDD835); // Muted Yellow
        textColor = Colors.black;
        break;
      case 'world':
        appBarColor = const Color(0xFFFB8C00); // Muted Orange
        textColor = Colors.black;
        break;
      case 'bonus':
        appBarColor = Colors.green.shade700; // Unchanged
        textColor = Colors.white;
        break;
      case 'reading':
      default:
        appBarColor = Colors.green.shade700;
        textColor = Colors.white;
        break;
    }

    return Scaffold(
      appBar: AppBar(
        leading: SoundBackButton(color: textColor == Colors.white ? Colors.white : Colors.black),
        title: Text(
          _topicName != null 
            ? "$_topicName - Level $_currentLevel" 
            : "${widget.subjectName} - Level $_currentLevel",
          style: TextStyle(color: textColor),
        ),
        backgroundColor: appBarColor,
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
          Center(child: _showIntroduction ? _buildIntroductionScreen() : _buildLessonContent()),
        ],
      ),
    );
  }

  Widget _buildIntroductionScreen() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24.0),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text(
            "Introduction",
            style: TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.bold,
              color: Colors.white,
              shadows: [Shadow(blurRadius: 4, color: Colors.black87)],
            ),
          ),
          const SizedBox(height: 40),
          _buildVisualVocabularyText(_introSlide!),
          const SizedBox(height: 60),
          TexturedButton(
            text: "Start Level 1",
            onPressed: () {
              setState(() {
                _showIntroduction = false;
              });
            },
            texture: ButtonTexture.wood,
            fontSize: 20,
            fixedSize: const Size(220, 60),
          ),
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
    } else if (_slides.isNotEmpty) {
      final isLastSlide = _currentSlideIndex == _slides.length - 1;
      final bool isReading = widget.subjectName.toLowerCase() == 'reading';

      return Column(
        children: [
          // 1. Progress Indicator (Dots)
          Padding(
            padding: const EdgeInsets.only(top: 16.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(_slides.length, (index) {
                return Container(
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: _currentSlideIndex == index
                        ? Colors.white
                        : Colors.white.withOpacity(0.3),
                  ),
                );
              }),
            ),
          ),

          // 1.5 STATIC IMAGE (Only for Reading)
          if (isReading && _slides.isNotEmpty)
            Expanded(
              flex: 3,
              child: _buildImageArea(_slides[0]), // Always show the first slide's image
            ),

          // 2. The Main Content Carousel
          Expanded(
            flex: isReading ? 2 : 1, // Reading gives less space to carousel (text only)
            child: PageView.builder(
              controller: _pageController,
              onPageChanged: (index) {
                setState(() {
                  _currentSlideIndex = index;
                });
                // Auto-stop any previous speech
                SoundManager.stop();
              },
              itemCount: _slides.length,
              itemBuilder: (context, index) {
                final slide = _slides[index];
                if (isReading) {
                  return _buildTextOnlySlide(slide, index);
                } else {
                  return _buildSlide(slide, index);
                }
              },
            ),
          ),

          // 3. Navigation & Actions
          Padding(
            padding: const EdgeInsets.only(bottom: 24.0, left: 16, right: 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (isLastSlide && _quizData != null)
                  TexturedButton(
                    text: "Let's Practice!",
                    onPressed: _launchQuiz,
                    texture: ButtonTexture.wood,
                    fontSize: 20,
                    fixedSize: const Size(280, 70),
                  )
                else
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      // Previous Button (Hidden on first slide)
                      Opacity(
                        opacity: _currentSlideIndex > 0 ? 1.0 : 0.0,
                        child: TexturedButton(
                          text: "Back",
                          onPressed: _currentSlideIndex > 0
                              ? () => _pageController.previousPage(
                                    duration: const Duration(milliseconds: 300),
                                    curve: Curves.easeInOut,
                                  )
                              : () {}, // Pass empty function instead of null
                          texture: ButtonTexture.stone,
                          fixedSize: const Size(120, 60),
                        ),
                      ),
                      // Next Button
                      TexturedButton(
                        text: "Next",
                        onPressed: () => _pageController.nextPage(
                          duration: const Duration(milliseconds: 300),
                          curve: Curves.easeInOut,
                        ),
                        texture: ButtonTexture.wood,
                        fixedSize: const Size(120, 60),
                      ),
                    ],
                  ),
                const SizedBox(height: 16),
                TextButton.icon(
                  icon: const Icon(Icons.auto_stories_sharp, color: Colors.white),
                  label: const Text(
                    "Ask For Help",
                    style: TextStyle(color: Colors.white),
                  ),
                  onPressed: () {
                    SoundManager.playClickSound();
                    if (_slides.isNotEmpty && _topicName != null) {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (context) => ChatScreen(
                            lessonContext: _slides[_currentSlideIndex].text,
                            topicName: _topicName!,
                            suggestedQuestions: _suggestedQuestions,
                          ),
                        ),
                      );
                    }
                  },
                ),
              ],
            ),
          ),
        ],
      );
    } else {
      return const Text("Welcome to your lesson!");
    }
  }

  // Helper method to build just the image container
  Widget _buildImageArea(LessonSlide slide) {
    return Container(
      margin: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white24, width: 2),
      ),
      clipBehavior: Clip.antiAlias,
      child: slide.localImagePath != null && slide.localImagePath!.isNotEmpty
          ? Image.asset(
              slide.localImagePath!,
              fit: BoxFit.contain,
              errorBuilder: (context, error, stackTrace) {
                print("ASSET_ERROR: Failed to load ${slide.localImagePath}");
                return Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.image_not_supported,
                          size: 50, color: Colors.white.withOpacity(0.2)),
                      const SizedBox(height: 8),
                      Text("Missing Asset",
                          style: TextStyle(
                              color: Colors.white.withOpacity(0.2), fontSize: 12)),
                    ],
                  ),
                );
              },
            )
          : const Center(child: Icon(Icons.image, size: 100)),
    );
  }

  // Helper method to build text-only slide (for Reading)
  Widget _buildTextOnlySlide(LessonSlide slide, int index) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24.0),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // B. The Speaker Icon
          Align(
            alignment: Alignment.centerRight,
            child: IconButton(
              icon: Image.asset("assets/images/speaker_icon.png"),
              iconSize: 44,
              onPressed: () {
                SoundManager.speak(
                  slide.text,
                  "${_getLessonId(_currentTopicId, _currentLevel)}_slide$index",
                );
              },
            ),
          ),

          // C. The Lesson Text (Chunked)
          Expanded(
            flex: 1,
            child: Center(
              child: _buildVisualVocabularyText(slide),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSlide(LessonSlide slide, int index) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24.0),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // A. The Image Area
          Expanded(
            flex: 3,
            child: _buildImageArea(slide),
          ),

          // B. The Speaker Icon
          Align(
            alignment: Alignment.centerRight,
            child: IconButton(
              icon: Image.asset("assets/images/speaker_icon.png"),
              iconSize: 44,
              onPressed: () {
                SoundManager.speak(
                  slide.text,
                  "${_getLessonId(_currentTopicId, _currentLevel)}_slide$index",
                );
              },
            ),
          ),

          // C. The Lesson Text (Chunked)
          Expanded(
            flex: 1,
            child: Center(
              child: _buildVisualVocabularyText(slide),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVisualVocabularyText(LessonSlide slide) {
    if (slide.keywords.isEmpty) {
      return Text(
        slide.text,
        style: const TextStyle(
          fontSize: 26,
          fontWeight: FontWeight.bold,
          color: Colors.white,
          shadows: [Shadow(blurRadius: 4, color: Colors.black87)],
        ),
        textAlign: TextAlign.center,
      );
    }

    // Split text into words and check for keywords
    final List<String> words = slide.text.split(' ');
    final List<Widget> spans = [];

    for (String word in words) {
      // Clean word from punctuation
      final cleanWord = word.toLowerCase().replaceAll(RegExp(r'[^\w\s]'), '');
      
      if (slide.keywords.containsKey(cleanWord)) {
        // This is a keyword!
        spans.add(
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            margin: const EdgeInsets.symmetric(horizontal: 2),
            decoration: BoxDecoration(
              color: Colors.yellow.withOpacity(0.2),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.yellow.withOpacity(0.5)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  word,
                  style: const TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.bold,
                    color: Colors.yellowAccent,
                  ),
                ),
                const SizedBox(width: 4),
                Text(
                  slide.keywords[cleanWord]!,
                  style: const TextStyle(fontSize: 24),
                ),
              ],
            ),
          ),
        );
      } else {
        spans.add(
          Text(
            "$word ",
            style: const TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.bold,
              color: Colors.white,
              shadows: [Shadow(blurRadius: 4, color: Colors.black87)],
            ),
          ),
        );
      }
    }

    return Wrap(
      alignment: WrapAlignment.center,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: spans,
    );
  }
}