{
  description = "Node.js/TypeScript backend shell with AWS tooling";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          name = "raser-backend";

          packages = with pkgs; [
            nodejs_22

            # Debugger 
            vscode-js-debug

            # AWS tooling
            awscli2
            aws-sam-cli
          ];

          shellHook = ''
            # Install project dependencies
            if [ ! -d "node_modules" ]; then
              echo "Running npm install..."
              npm install
            fi

            # Put project-local binaries (cdk, tsx, jest...) on PATH.
            export PATH="$PWD/node_modules/.bin:$PATH"

            # Do not open a pager for AWS CLI output.
            export AWS_PAGER=""
          '';
        };

        formatter = pkgs.nixfmt;
      }
    );
}
