// Location: lib/quiz_screen.dart

import 'package:flutter/material.dart';

class QuizScreen extends StatefulWidget {
  final List<Map<String, dynamic>> quizData;

  const QuizScreen({super.key, required this.quizData});

  @override
  State<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends State<QuizScreen> {
  int _currentQuestionIndex = 0;
  int _score = 0;

  void _answerQuestion(String selectedAnswer) {
    final correctAnswer = widget.quizData[_currentQuestionIndex]['answer'];
    bool isCorrect = selectedAnswer == correctAnswer;

    if (isCorrect) {
      // If correct, increase the score.
      _score++;
    }

    showDialog(
      context: context,
      barrierDismissible: false, // User must tap the button to continue
      builder: (context) {
        return AlertDialog(
          title: Text(isCorrect ? "Correct!" : "Try Again!"),
          content: Text("The correct answer was: $correctAnswer"),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(context).pop(); // Close the dialog
                _nextQuestion(); // Move to the next question
              },
              child: const Text("Next"),
            ),
          ],
        );
      },
    );
  }

  void _nextQuestion() {
    // Check if there are more questions left.
    if (_currentQuestionIndex < widget.quizData.length - 1) {
      // If so, move to the next question.
      setState(() {
        _currentQuestionIndex++;
      });
    } else {
      // If the quiz is over, pop the screen and send the score back.
      // The "true" value indicates the user passed. We'll make this smarter later.
      bool passed = _score > 0;
      Navigator.of(context).pop(passed);
    }
  }

  @override
  Widget build(BuildContext context) {
    final currentQuestion = widget.quizData[_currentQuestionIndex];

    return Scaffold(
      appBar: AppBar(
        title: Text("Question ${_currentQuestionIndex + 1}/${widget.quizData.length}"),
        backgroundColor: Colors.deepPurple.shade400,
        // Prevent the user from using the back button to cheat
        automaticallyImplyLeading: false,
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                currentQuestion['question'],
                style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 40),
              ElevatedButton(
                style: ElevatedButton.styleFrom(minimumSize: const Size(200, 50)),
                onPressed: () => _answerQuestion(currentQuestion['answer']),
                child: Text(currentQuestion['answer'], style: const TextStyle(fontSize: 20)),
              ),
              const SizedBox(height: 20),
              ElevatedButton(
                style: ElevatedButton.styleFrom(minimumSize: const Size(200, 50)),
                onPressed: () => _answerQuestion("A wrong answer"),
                child: const Text("A wrong answer", style: TextStyle(fontSize: 20)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}