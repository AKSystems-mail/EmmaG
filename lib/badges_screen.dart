// Location: lib/badges_screen.dart

import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
// ADD THIS IMPORT for shared preferences
import 'package:shared_preferences/shared_preferences.dart';
import 'sound_manager.dart'; // For click sounds

class Badge {
  final String id; // We'll store the ID now for potential future use
  final String name;
  final String imageUrl;

  Badge({required this.id, required this.name, required this.imageUrl});
}

class BadgesScreen extends StatefulWidget {
  const BadgesScreen({super.key});

  @override
  State<BadgesScreen> createState() => _BadgesScreenState();
}

class _BadgesScreenState extends State<BadgesScreen> {
  bool _isLoading = true;
  List<Badge> _earnedBadges = [];
  String? _errorMessage;
  bool _showInfoDialog = true; // To control the initial dialog

  @override
  void initState() {
    super.initState();
    _checkIfInfoDialogNeeded();
    _fetchEarnedBadges();
  }

  // Check if we need to show the info dialog
  Future<void> _checkIfInfoDialogNeeded() async {
    final prefs = await SharedPreferences.getInstance();
    // Get the stored preference, default to true if not found
    setState(() {
      _showInfoDialog = prefs.getBool('showBadgeInfoDialog') ?? true;
    });

    if (_showInfoDialog && mounted) {
      // mounted check is important for async operations in initState
      WidgetsBinding.instance.addPostFrameCallback((_) => _showBadgeInfoDialog());
    }
  }

void _showBadgeInfoDialog() {
  bool doNotShowAgain = false;

  showDialog(
    context: context,
    builder: (context) {
      // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
      // THE FIX: We use a Dialog widget to allow for a custom shape/background.
      // +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
      return Dialog(
        backgroundColor: Colors.transparent, // Make the default square background invisible
        child: Container(
          padding: const EdgeInsets.all(24.0),
          decoration: const BoxDecoration(
            image: DecorationImage(
              // Use the parchment image as the background for the dialog
              image: AssetImage("assets/images/parchment_background.png"),
              fit: BoxFit.fill, // Stretch the image to fill the container
            ),
          ),
          child: StatefulBuilder( // We still need StatefulBuilder for the checkbox
            builder: (context, setDialogState) {
              return Column(
                mainAxisSize: MainAxisSize.min, // Make the column only as tall as its content
                children: [
                  const Text(
                    "Welcome to Your Trophy Room!",
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      // Use a dark, parchment-friendly color
                      color: Color(0xFF5D4037), 
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    "Here you can see all the cool badges you earn by mastering topics in each subject. "
                    "Keep learning to collect them all!",
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 16,
                      color: Color(0xFF5D4037),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Checkbox(
                        value: doNotShowAgain,
                        onChanged: (bool? value) {
                          setDialogState(() {
                            doNotShowAgain = value ?? false;
                          });
                        },
                      ),
                      const Text(
                        "Don't show this again",
                        style: TextStyle(color: Color(0xFF5D4037)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  TextButton(
                    onPressed: () async {
                      SoundManager.playClickSound();
                      if (doNotShowAgain) {
                        final prefs = await SharedPreferences.getInstance();
                        await prefs.setBool('showBadgeInfoDialog', false);
                      }
                      Navigator.of(context).pop();
                    },
                    child: const Text(
                      "OK",
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
              ),
                ]);
          },
        )));
      },
    );
  }

  Future<void> _fetchEarnedBadges() async {
    // ... (This function is mostly the same, but ensure you are getting the ID)
    setState(() => _isLoading = true);
    try {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) throw Exception("No user logged in.");

      final userDoc = await FirebaseFirestore.instance.collection('users').doc(user.uid).get();
      final List<String> badgeIds = List<String>.from(userDoc.data()?['earnedBadges'] ?? []);

      if (badgeIds.isEmpty) {
        setState(() { _isLoading = false; });
        return;
      }

      List<Badge> badges = [];
      for (String badgeId in badgeIds) {
        final badgeDoc = await FirebaseFirestore.instance.collection('badges').doc(badgeId).get();
        if (badgeDoc.exists) {
          badges.add(Badge(
            id: badgeDoc.id, // Store the ID
            name: badgeDoc.data()?['name'] ?? 'Unnamed Badge',
            imageUrl: badgeDoc.data()?['imageUrl'] ?? '',
          ));
        } else {
          print("Warning: Badge document with ID '$badgeId' not found in 'badges' collection.");
        }
      }

      setState(() {
        _earnedBadges = badges;
        _isLoading = false;
      });

    } catch (e) {
      setState(() {
        _errorMessage = "Could not load badges.";
        _isLoading = false;
      });
      print("Error fetching badges: $e");
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("My Badges"),
        backgroundColor: Colors.amber.shade700,
      ),
      // ADDED: Stack for background image
      body: Stack(
        children: [
          // Background Image
          Container(
            decoration: const BoxDecoration(
              image: DecorationImage(
                image: AssetImage("assets/images/trophy_room.png"), // Your background
                fit: BoxFit.cover,
              ),
            ),
          ),
          // Semi-transparent overlay for better text readability on background
          Container(
             color: Colors.black.withOpacity(0.3),
          ),
          // Actual content
          _buildContent(),
        ],
      ),
    );
  }

  Widget _buildContent() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_errorMessage != null) {
      return Center(child: Text(_errorMessage!, style: const TextStyle(color: Colors.red, fontSize: 18)));
    }
    if (_earnedBadges.isEmpty) {
      return const Center(
        child: Padding( // Added padding for better centering
          padding: EdgeInsets.all(20.0),
          child: Text(
            "No badges earned yet.\nKeep learning to fill your trophy room!",
            style: TextStyle(fontSize: 20, color: Colors.white, fontWeight: FontWeight.bold),
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    return GridView.builder(
      padding: const EdgeInsets.all(24.0), // Increased padding
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        crossAxisSpacing: 20.0, // Increased spacing
        mainAxisSpacing: 20.0,  // Increased spacing
        childAspectRatio: 0.8, // Adjust for better badge shape
      ),
      itemCount: _earnedBadges.length,
      itemBuilder: (context, index) {
        final badge = _earnedBadges[index];
        return Card( // Wrap badge in a Card for better visual separation
          elevation: 4.0,
          color: Colors.white.withOpacity(0.85),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          child: Padding(
            padding: const EdgeInsets.all(8.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Expanded( // Make image take available space
                  child: Image.network(
                    badge.imageUrl, 
                    fit: BoxFit.contain,
                    // Add a loading builder for network images
                    loadingBuilder: (BuildContext context, Widget child, ImageChunkEvent? loadingProgress) {
                      if (loadingProgress == null) return child;
                      return Center(child: CircularProgressIndicator(
                        value: loadingProgress.expectedTotalBytes != null 
                               ? loadingProgress.cumulativeBytesLoaded / loadingProgress.expectedTotalBytes!
                               : null,
                      ));
                    },
                    // Add an error builder for network images
                    errorBuilder: (BuildContext context, Object exception, StackTrace? stackTrace) {
                      return const Icon(Icons.broken_image, size: 40, color: Colors.grey);
                    },
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  badge.name, 
                  textAlign: TextAlign.center, 
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: Colors.black87),
                  maxLines: 2, // Prevent long names from overflowing
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}