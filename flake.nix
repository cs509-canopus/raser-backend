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
        postgresql = pkgs.postgresql_16;

        # Lifecycle commands for the local postgres instance.
        pgScripts = [
          (pkgs.writeShellScriptBin "pg-start" ''
            ${postgresql}/bin/pg_ctl -l "$PGLOG" start
          '')
          (pkgs.writeShellScriptBin "pg-stop" ''
            ${postgresql}/bin/pg_ctl stop
          '')
          (pkgs.writeShellScriptBin "pg-status" ''
            ${postgresql}/bin/pg_ctl status
          '')
        ];
      in
      {
        devShells.default = pkgs.mkShell {
          name = "raser-backend";

          packages =
            with pkgs;
            [
              nodejs_22

              # Debugger
              vscode-js-debug

              # AWS tooling
              awscli2
              aws-sam-cli

              # Local postgres instance
              postgresql
            ]
            ++ pgScripts;

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

            # Keep postgres data alongside direnv (gitignored)
            export PGDATA="$PWD/.direnv/db"
            export PGSOCKETS="$PWD/.direnv/sockets"
            export PGLOG="$PWD/.direnv/postgresql.log"
            export PGHOST="$PGSOCKETS"
            export PGPORT=5432
            export PGUSER=postgres
            export PGDATABASE=postgres
            export DATABASE_URL="postgresql://$PGUSER@localhost:$PGPORT/$PGDATABASE"

            mkdir -p "$PGSOCKETS"

            # Initialize the cluster on first entry
            if [ ! -f "$PGDATA/PG_VERSION" ]; then
              initdb --username="$PGUSER" --auth=trust --no-locale --encoding=UTF8 > /dev/null
              echo "unix_socket_directories = '$PGSOCKETS'" >> "$PGDATA/postgresql.conf"
              echo "listen_addresses = '127.0.0.1'" >> "$PGDATA/postgresql.conf"
              echo "port = $PGPORT" >> "$PGDATA/postgresql.conf"
            fi
          '';
        };

        formatter = pkgs.nixfmt;
      }
    );
}
