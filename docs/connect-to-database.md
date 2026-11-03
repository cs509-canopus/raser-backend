# How to connect to the RDS database

## Prerequisites

Set the `RASER_STAGE` environment variable to the name of your developer stage (e.g.,
'asuyer'). This will be used to connect to *your own* database inside the RDS instance.
You can set this in a `.env` file like so:

```
RASER_STAGE='asuyer'    # replace with your username
```

In order to connect to postgres, you need to 
[install postgres v16](https://www.postgresql.org/download/)
to get the `psql` command. Follow the instructions at the provided link.

If you use nix, then running `nix develop` will install postgres for you.

Verify your installation with:

```sh
psql --version
# example output: psql (PostgreSQL) 16.15
```

## db-connect.sh script

The `scripts/db-connect.sh` script opens a tunneled connection to the RDS database
instance, then drops you into a `psql` shell. 

The usages of the script are as follows:

```sh
# Most important usages:
scripts/db-connect.sh                         # interactive psql on your $RASER_STAGE database
scripts/db-connect.sh -f db/schema.sql        # run a SQL file

# Other less-common usages:
scripts/db-connect.sh -c 'select now();'      # any extra arguments go to psql
DB_NAME=postgres scripts/db-connect.sh        # connect to some other database once
TUNNEL_ONLY=1 scripts/db-connect.sh           # keep only the tunnel open (for a GUI client etc.) until Ctrl-C
LOCAL_PORT=15432 scripts/db-connect.sh        # if port 5433 is already in use
```

If you want to use a graphical database app, then use the `TUNNEL_ONLY=1` line above.
Once the tunnel is created, you can access the database as if it is running locally on
port 5433. The connection string for the database is:

```
postgresql://raser_admin@localhost:5433/<stage-name>
```

