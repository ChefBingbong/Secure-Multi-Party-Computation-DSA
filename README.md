# Multi-Party Threshold Signature Scheme (TSS) TypeScript impl

A attempt to implement a trustless secure multi-party TSS digital signature scheme for private key management over a network of P2P nodes in typescript, This repo is mainly for learnng purposes to explore and learn about distributed systems and crypto programming. the code in this repo is definitely not meant for production use

# WIP
this work is not complete. so far i have only started working on the keygen step. Signing, key refresh aswell as the p2p and rpc layer have not been implemented yet.

# Scheme Overview
This TSS protocol is based from the paper https://eprint.iacr.org/2021/060.pdf and consists of four phases; one phase for generating the (shared) key which is run once, one phase to refresh the secret key-shares and to generate the auxiliary information required for
signing, one to preprocess signatures before the messages are known, and finally, one for calculating and communicating the signature-shares once the message to be signed is known.

## Key Generation:
Participants work together to create a shared private key without revealing it entirely. The public key is derived from this collaboration.

## Signing:
To sign a message, participants combine their private key shares in a secure way. The result is a valid signature for the message, verifiable using the public key.

## Key Refresh:
Periodically, the shared private key is updated without changing the public key. This ensures ongoing security, even if some key shares are compromised.

# Keygen Overview
The keygen process involves 5 different rounds where each party computes and validates data that gets shared across the party. the process is initiated by creatimg a paillier key pair from a set of randomly generated
large primes. The Paillier encryption scheme is a probabilistic asymmetric algorithm for public-key cryptography, proposed by Pascal Paillier in 1999. The scheme is based on the difficulty of the decisional composite residuosity assumption.

