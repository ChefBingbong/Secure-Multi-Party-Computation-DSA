# Multi-Party Threshold Signature Scheme (TSS) TypeScript impl

A attempt to implement a trustless secure multi-party TSS digital signature scheme for private key management over a network of P2P nodes in typescript, This repo is mainly for learnng purposes to explore and learn about distributed systems and crypto programming. the code in this repo is definitely not meant for production use

## WIP
this work is not complete. so far i have only started working on the keygen step. Signing, key refresh aswell as the p2p and rpc layer have not been implemented yet.

## Scheme Overview
This TSS protocol is based from the paper https://eprint.iacr.org/2021/060.pdf and consists of four phases; one phase for generating the (shared) key which is run once, one phase to refresh the secret key-shares and to generate the auxiliary information required for
signing, one to preprocess signatures before the messages are known, and finally, one for calculating and communicating the signature-shares once the message to be signed is known. my implementation is also based on this golang implementation https://github.com/taurusgroup/multi-party-sig for guidance

### Key Generation:
Participants work together to create a shared private key without revealing it entirely. The public key is derived from this collaboration.

### Signing:
To sign a message, participants combine their private key shares in a secure way. The result is a valid signature for the message, verifiable using the public key.

### Key Refresh:
Periodically, the shared private key is updated without changing the public key. This ensures ongoing security, even if some key shares are compromised.

## Whats Done So Far
### Keygen
From following the golang implementation provided paper i have so far nearly implemented the keygen process for secp256k1 keys. On a high level the keygen process involves 5 different rounds where each party computes and validates data that gets shared across the entrie party. the process is initiated by creatimg a paillier key pair from a set of randomly generated
large primes. The Paillier encryption scheme is a probabilistic asymmetric algorithm for public-key cryptography, Its a Homomorphic encryption scheme which allows us to perform mathematical or logical operations on encrypted data. the scheme allows two types of computation:

1) addition of two ciphertexts
2) multiplication of a ciphertext by a plaintext number

Pailliers cryptosystem is used to generate keys because its homomorphic nature ensures better security in later rounds of the keygen process because parties can operate on their encrypted shares using their paillier keys. 

After this each party generates a VSS polynomial of degree T where T is the party length - 1 and with randomly sampled coefficents from a range on the secp256k1 curve. each party can then compute their self secret share by evaluating this polynomial. Each parties share will eventually be used to generate the resulting group key. Lastly each party will then generate a randomId, a schnorr NZIK proof and commit these values. When all of this is done each prarty will broadcast their vss polynomials, schnorr commitment and paillier public key to each other party

Every party will then verifier every other parties message add it to the commits and send this result back before moving onto the next round. Each party now is tasked with generating their own series of zk proofs using their paillier keys. these proofs need to get verified by every other party to ensure the validity of everyones secret share. once all the proofs are verified after some back and forth the final party public key can be constructed from combining and evaluating each partys VSS polynomial. One more proof is generated and verified after this to ensure the party key was constructed correctly

### P2P Network and Http Api
I have also implemented a p2p network and http server to allow nodes to interact over the network. the current state of the p2p network has full peer sync, broadcasting, and direct message capabilities aswell as REST endpoints for individually sending messages to other peers aswell as envoking the TSS protocol. The next step is to handle the keygen generation process over the p2p network.

### In Memory DB with redis
ive implemented an in memory database to store the state of the validators array to Disk such that when a new node joins the network they dont need to provide an configuration about the existing state of the VM before they joined. this in combination with state relplication amoung nodes keeps the validators list up-to-date always amoungst all nodes, new and old.
