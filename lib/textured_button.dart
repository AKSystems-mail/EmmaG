// Location: lib/textured_button.dart

import 'package:flutter/material.dart';
import 'sound_manager.dart'; // For click sounds

enum ButtonTexture { stone, wood }

class TexturedButton extends StatelessWidget {
  final VoidCallback onPressed;
  final String text;
  final ButtonTexture texture;
  final double fontSize;
  final EdgeInsets padding;
  final Size? fixedSize;
  final TextStyle? textStyle;

  const TexturedButton({
    super.key,
    required this.onPressed,
    required this.text,
    this.texture = ButtonTexture.stone, // Default to stone
    this.fontSize = 18.0,
    this.padding = const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
    this.fixedSize,
    this.textStyle, // Add this 
  });

  String get _texturePath {
    switch (texture) {
      case ButtonTexture.wood:
        return "assets/images/wood_button_texture.png";
      case ButtonTexture.stone:
        return "assets/images/stone_button_texture.png";
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector( // Using GestureDetector for more control over tap behavior on custom shape
      onTap: () {
        SoundManager.playClickSound();
        onPressed();
      },
      child: Container(
        width: fixedSize?.width,   // Apply fixed width if provided
        height: fixedSize?.height, // Apply fixed height if provided
        decoration: BoxDecoration(
          image: DecorationImage(
            image: AssetImage(_texturePath),
            // BoxFit.contain will ensure the entire button image is visible
            // and maintains its aspect ratio. The Container's size will determine its final look.
            fit: BoxFit.contain, 
          ),
        ),
        // This inner Container is for padding the text INSIDE the button texture
        child: Padding(
          padding: padding, 
          child: Center( // Center the text within the button
            child: Text(
              text,
      textAlign: TextAlign.center,
      // Use the provided textStyle, or fall back to a default
      style: textStyle ?? TextStyle(
        fontSize: fontSize,
        color: Colors.white,
        fontWeight: FontWeight.bold,
        shadows: const [Shadow(blurRadius: 2.0, color: Colors.black87, offset: Offset(1,1))]
      ),
          ),
        ),
      ),
    ));
  }
}