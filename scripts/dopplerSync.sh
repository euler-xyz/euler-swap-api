#!/bin/bash
TOKENS=("local")
PROJECT_NAME="euler-swap-api"


for TOKEN in ${TOKENS[@]}; do
    # Download secrets and store them in a temporary file
    doppler setup -p $PROJECT_NAME --config $TOKEN && doppler secrets download --no-file --format env > .env.${TOKEN}
done

# .env.${ENV/-/.} => ${string/substring/replacement} | replaces the - with a dot.
# In doppler UI those can't use dots in the env naming but locally we want them
