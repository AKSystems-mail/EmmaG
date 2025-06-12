# Location: dev.nix

{ pkgs, ... }: {
  channel = "stable-24.05";

  # We only need the base Python package.
  packages = [
    pkgs.jdk17
    pkgs.unzip
    pkgs.python312
  ];

  env = {};

  idx = {
    extensions = [
      "Dart-Code.flutter"
      "Dart-Code.dart-code"
    ];
    workspace = {
      onCreate = {};
      
      # This hook now creates the virtual environment and installs packages into it.
      onStart = {
        setup-python-env = ''
          echo "Setting up Python virtual environment..."
          # Create the venv folder if it doesn't exist
          if [ ! -d ".venv" ]; then
            python3 -m venv .venv
            echo "Virtual environment created."
          fi
          # Install/upgrade packages into the virtual environment's pip
          .venv/bin/pip install --upgrade google-generativeai firebase-admin
          echo "Python packages are ready."
        '';
      };
    };
    previews = {
      enable = true;
      previews = {
        web = {
          command = ["flutter" "run" "--machine" "-d" "web-server" "--web-hostname" "0.0.0.0" "--web-port" "$PORT"];
          manager = "flutter";
        };
        android = {
          command = ["flutter" "run" "--machine" "-d" "android" "-d" "localhost:5555"];
          manager = "flutter";
        };
      };
    };
  };
}