# Location: dev.nix

{ pkgs, ... }: {
  # Which nixpkgs channel to use.
  channel = "stable-24.05";

  # Use https://search.nixos.org/packages to find packages
  packages = [
    pkgs.jdk17
    pkgs.unzip
    
    # We keep your specific Python version.
    pkgs.python312

    # +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    # ADDED: This is the "Nix way" to add Python libraries.
    # It creates a Python environment that includes the specified packages.
    # +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    (pkgs.python312.withPackages (ps: [
      ps.google-generativeai
    ]))
  ];

  # Sets environment variables in the workspace
  env = {};

  # Keep the entire idx configuration block as it is.
  idx = {
    # Search for the extensions you want on https://open-vsx.org/ and use "publisher.id"
    extensions = [
      "Dart-Code.flutter"
      "Dart-Code.dart-code"
    ];
    workspace = {
      # Runs when a workspace is first created with this `dev.nix` file
      onCreate = { };
      # To run something each time the workspace is (re)started, use the `onStart` hook
    };
    # Enable previews and customize configuration
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