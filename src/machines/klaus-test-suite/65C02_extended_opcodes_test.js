/*

https://github.com/Klaus2m5/6502_65C02_functional_tests/blob/master/bin_files/65C02_extended_opcodes_test.lst

 */
const RAM = `
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 C3 82 41 00 7F 00 1F 71 80 0F FF 7F 80
FF 0F 8F 8F 10 02 11 02 12 02 13 02 14 02 18 01
05 02 06 02 07 02 08 02 0D 01 47 02 48 02 49 02
4A 02 4B 02 4C 02 4D 02 4E 02 43 02 44 02 45 02
46 02 05 02 06 02 06 01 07 01 FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
00 00 00 00 00 00 00 00 00 00 69 00 60 E9 00 60
C3 82 41 00 7F 80 80 00 02 86 04 82 00 87 05 83
01 61 41 20 00 E1 C1 A0 80 81 01 80 02 81 01 80
00 01 00 01 02 81 80 81 80 7F 80 FF 00 01 00 80
80 02 00 00 1F 71 80 0F FF 7F 80 FF 0F 8F 8F 00
F1 1F 00 F0 FF FF FF FF F0 F0 0F 00 FF 7F 80 02
80 00 80 FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF FF
D8 A2 FF 9A A9 00 8D 02 02 AD 02 02 C9 00 D0 FE
A9 01 8D 02 02 A9 99 A2 FF 9A A2 55 DA A2 AA DA
EC FE 01 D0 FE BA E0 FD D0 FE 7A C0 AA D0 FE 7A
C0 55 D0 FE CC FF 01 D0 FE BA E0 FF D0 FE A0 A5
5A A0 5A 5A CC FE 01 D0 FE BA E0 FD D0 FE FA E0
5A D0 FE FA E0 A5 D0 FE EC FF 01 D0 FE BA E0 FF
D0 FE C9 99 D0 FE AD 02 02 C9 01 D0 FE A9 02 8D
02 02 A0 AA A9 FF 48 A2 01 28 DA 08 E0 01 D0 FE
68 48 C9 FF D0 FE 28 A9 00 48 A2 00 28 DA 08 E0
00 D0 FE 68 48 C9 30 D0 FE 28 A9 FF 48 A2 FF 28
DA 08 E0 FF D0 FE 68 48 C9 FF D0 FE 28 A9 00 48
A2 01 28 DA 08 E0 01 D0 FE 68 48 C9 30 D0 FE 28
A9 FF 48 A2 00 28 DA 08 E0 00 D0 FE 68 48 C9 FF
D0 FE 28 A9 00 48 A2 FF 28 DA 08 E0 FF D0 FE 68
48 C9 30 D0 FE 28 A9 FF 48 A2 00 28 FA 08 E0 FF
D0 FE 68 48 C9 FD D0 FE 28 A9 00 48 A2 FF 28 FA
08 E0 00 D0 FE 68 48 C9 32 D0 FE 28 A9 FF 48 A2
FE 28 FA 08 E0 01 D0 FE 68 48 C9 7D D0 FE 28 A9
00 48 A2 00 28 FA 08 E0 FF D0 FE 68 48 C9 B0 D0
FE 28 A9 FF 48 A2 FF 28 FA 08 E0 00 D0 FE 68 48
C9 7F D0 FE 28 A9 00 48 A2 FE 28 FA 08 E0 01 D0
FE 68 48 C9 30 D0 FE 28 C0 AA D0 FE AD 02 02 C9
02 D0 FE A9 03 8D 02 02 A2 55 A9 FF 48 A0 01 28
5A 08 C0 01 D0 FE 68 48 C9 FF D0 FE 28 A9 00 48
A0 00 28 5A 08 C0 00 D0 FE 68 48 C9 30 D0 FE 28
A9 FF 48 A0 FF 28 5A 08 C0 FF D0 FE 68 48 C9 FF
D0 FE 28 A9 00 48 A0 01 28 5A 08 C0 01 D0 FE 68
48 C9 30 D0 FE 28 A9 FF 48 A0 00 28 5A 08 C0 00
D0 FE 68 48 C9 FF D0 FE 28 A9 00 48 A0 FF 28 5A
08 C0 FF D0 FE 68 48 C9 30 D0 FE 28 A9 FF 48 A0
00 28 7A 08 C0 FF D0 FE 68 48 C9 FD D0 FE 28 A9
00 48 A0 FF 28 7A 08 C0 00 D0 FE 68 48 C9 32 D0
FE 28 A9 FF 48 A0 FE 28 7A 08 C0 01 D0 FE 68 48
C9 7D D0 FE 28 A9 00 48 A0 00 28 7A 08 C0 FF D0
FE 68 48 C9 B0 D0 FE 28 A9 FF 48 A0 FF 28 7A 08
C0 00 D0 FE 68 48 C9 7F D0 FE 28 A9 00 48 A0 FE
28 7A 08 C0 01 D0 FE 68 48 C9 30 D0 FE 28 E0 55
D0 FE AD 02 02 C9 03 D0 FE A9 04 8D 02 02 A2 81
A0 7E A9 FF 48 A9 00 28 80 03 4C 6A 06 08 C9 00
D0 FE 68 48 C9 FF D0 FE 28 A9 00 48 A9 FF 28 80
03 4C 81 06 08 C9 FF D0 FE 68 48 C9 30 D0 FE 28
E0 81 D0 FE C0 7E D0 FE AD 02 02 C9 04 D0 FE A9
05 8D 02 02 A0 00 80 61 C0 01 D0 FE C8 80 53 C0
03 D0 FE C8 80 45 C0 05 D0 FE C8 A0 00 80 04 C8
C8 C8 C8 80 03 C8 C8 C8 C8 80 02 C8 C8 C8 C8 80
01 C8 C8 C8 C8 80 00 C8 C8 C8 C8 C0 0A D0 FE 80
12 88 88 88 88 80 0E 88 88 88 80 F5 88 88 80 F7
88 80 F9 80 FB C0 00 D0 FE 80 15 C0 04 D0 FE C8
80 B4 C0 02 D0 FE C8 80 A6 C0 00 D0 FE C8 80 98
AD 02 02 C9 05 D0 FE A9 06 8D 02 02 A2 11 A0 22
A9 01 85 0C A9 00 48 A9 33 28 0F 0C 06 8F 0C 06
4C 30 07 4C 33 07 08 C9 33 D0 FE 68 48 C9 30 D0
FE 28 A9 FF 48 A9 CC 28 0F 0C 06 8F 0C 06 4C 4E
07 4C 51 07 08 C9 CC D0 FE 68 48 C9 FF D0 FE 28
A5 0C C9 01 D0 FE A9 FE 85 0C A9 00 48 A9 33 28
8F 0C 06 0F 0C 06 4C 76 07 4C 79 07 08 C9 33 D0
FE 68 48 C9 30 D0 FE 28 A9 FF 48 A9 CC 28 8F 0C
06 0F 0C 06 4C 94 07 4C 97 07 08 C9 CC D0 FE 68
48 C9 FF D0 FE 28 A5 0C C9 FE D0 FE A9 02 85 0C
A9 00 48 A9 33 28 1F 0C 06 9F 0C 06 4C BC 07 4C
BF 07 08 C9 33 D0 FE 68 48 C9 30 D0 FE 28 A9 FF
48 A9 CC 28 1F 0C 06 9F 0C 06 4C DA 07 4C DD 07
08 C9 CC D0 FE 68 48 C9 FF D0 FE 28 A5 0C C9 02
D0 FE A9 FD 85 0C A9 00 48 A9 33 28 9F 0C 06 1F
0C 06 4C 02 08 4C 05 08 08 C9 33 D0 FE 68 48 C9
30 D0 FE 28 A9 FF 48 A9 CC 28 9F 0C 06 1F 0C 06
4C 20 08 4C 23 08 08 C9 CC D0 FE 68 48 C9 FF D0
FE 28 A5 0C C9 FD D0 FE A9 04 85 0C A9 00 48 A9
33 28 2F 0C 06 AF 0C 06 4C 48 08 4C 4B 08 08 C9
33 D0 FE 68 48 C9 30 D0 FE 28 A9 FF 48 A9 CC 28
2F 0C 06 AF 0C 06 4C 66 08 4C 69 08 08 C9 CC D0
FE 68 48 C9 FF D0 FE 28 A5 0C C9 04 D0 FE A9 FB
85 0C A9 00 48 A9 33 28 AF 0C 06 2F 0C 06 4C 8E
08 4C 91 08 08 C9 33 D0 FE 68 48 C9 30 D0 FE 28
A9 FF 48 A9 CC 28 AF 0C 06 2F 0C 06 4C AC 08 4C
AF 08 08 C9 CC D0 FE 68 48 C9 FF D0 FE 28 A5 0C
C9 FB D0 FE A9 08 85 0C A9 00 48 A9 33 28 3F 0C
06 BF 0C 06 4C D4 08 4C D7 08 08 C9 33 D0 FE 68
48 C9 30 D0 FE 28 A9 FF 48 A9 CC 28 3F 0C 06 BF
0C 06 4C F2 08 4C F5 08 08 C9 CC D0 FE 68 48 C9
FF D0 FE 28 A5 0C C9 08 D0 FE A9 F7 85 0C A9 00
48 A9 33 28 BF 0C 06 3F 0C 06 4C 1A 09 4C 1D 09
08 C9 33 D0 FE 68 48 C9 30 D0 FE 28 A9 FF 48 A9
CC 28 BF 0C 06 3F 0C 06 4C 38 09 4C 3B 09 08 C9
CC D0 FE 68 48 C9 FF D0 FE 28 A5 0C C9 F7 D0 FE
A9 10 85 0C A9 00 48 A9 33 28 4F 0C 06 CF 0C 06
4C 60 09 4C 63 09 08 C9 33 D0 FE 68 48 C9 30 D0
FE 28 A9 FF 48 A9 CC 28 4F 0C 06 CF 0C 06 4C 7E
09 4C 81 09 08 C9 CC D0 FE 68 48 C9 FF D0 FE 28
A5 0C C9 10 D0 FE A9 EF 85 0C A9 00 48 A9 33 28
CF 0C 06 4F 0C 06 4C A6 09 4C A9 09 08 C9 33 D0
FE 68 48 C9 30 D0 FE 28 A9 FF 48 A9 CC 28 CF 0C
06 4F 0C 06 4C C4 09 4C C7 09 08 C9 CC D0 FE 68
48 C9 FF D0 FE 28 A5 0C C9 EF D0 FE A9 20 85 0C
A9 00 48 A9 33 28 5F 0C 06 DF 0C 06 4C EC 09 4C
EF 09 08 C9 33 D0 FE 68 48 C9 30 D0 FE 28 A9 FF
48 A9 CC 28 5F 0C 06 DF 0C 06 4C 0A 0A 4C 0D 0A
08 C9 CC D0 FE 68 48 C9 FF D0 FE 28 A5 0C C9 20
D0 FE A9 DF 85 0C A9 00 48 A9 33 28 DF 0C 06 5F
0C 06 4C 32 0A 4C 35 0A 08 C9 33 D0 FE 68 48 C9
30 D0 FE 28 A9 FF 48 A9 CC 28 DF 0C 06 5F 0C 06
4C 50 0A 4C 53 0A 08 C9 CC D0 FE 68 48 C9 FF D0
FE 28 A5 0C C9 DF D0 FE A9 40 85 0C A9 00 48 A9
33 28 6F 0C 06 EF 0C 06 4C 78 0A 4C 7B 0A 08 C9
33 D0 FE 68 48 C9 30 D0 FE 28 A9 FF 48 A9 CC 28
6F 0C 06 EF 0C 06 4C 96 0A 4C 99 0A 08 C9 CC D0
FE 68 48 C9 FF D0 FE 28 A5 0C C9 40 D0 FE A9 BF
85 0C A9 00 48 A9 33 28 EF 0C 06 6F 0C 06 4C BE
0A 4C C1 0A 08 C9 33 D0 FE 68 48 C9 30 D0 FE 28
A9 FF 48 A9 CC 28 EF 0C 06 6F 0C 06 4C DC 0A 4C
DF 0A 08 C9 CC D0 FE 68 48 C9 FF D0 FE 28 A5 0C
C9 BF D0 FE A9 80 85 0C A9 00 48 A9 33 28 7F 0C
06 FF 0C 06 4C 04 0B 4C 07 0B 08 C9 33 D0 FE 68
48 C9 30 D0 FE 28 A9 FF 48 A9 CC 28 7F 0C 06 FF
0C 06 4C 22 0B 4C 25 0B 08 C9 CC D0 FE 68 48 C9
FF D0 FE 28 A5 0C C9 80 D0 FE A9 7F 85 0C A9 00
48 A9 33 28 FF 0C 06 7F 0C 06 4C 4A 0B 4C 4D 0B
08 C9 33 D0 FE 68 48 C9 30 D0 FE 28 A9 FF 48 A9
CC 28 FF 0C 06 7F 0C 06 4C 68 0B 4C 6B 0B 08 C9
CC D0 FE 68 48 C9 FF D0 FE 28 A5 0C C9 7F D0 FE
E0 11 D0 FE C0 22 D0 FE AD 02 02 C9 06 D0 FE A9
07 8D 02 02 A9 00 85 0C A9 00 0F 0C 02 49 01 1F
0C 02 49 02 2F 0C 02 49 04 3F 0C 02 49 08 4F 0C
02 49 10 5F 0C 02 49 20 6F 0C 02 49 40 7F 0C 02
49 80 45 0C D0 FE A9 FF 8F 0C 02 49 01 9F 0C 02
49 02 AF 0C 02 49 04 BF 0C 02 49 08 CF 0C 02 49
10 DF 0C 02 49 20 EF 0C 02 49 40 FF 0C 02 49 80
45 0C D0 FE E6 0C D0 A0 AD 02 02 C9 07 D0 FE A9
08 8D 02 02 A0 42 A2 02 02 C8 CA CA D0 FE A9 00
48 A9 FD 28 02 EA EA 08 C9 FD D0 FE 68 48 C9 30
D0 FE 28 A9 FF 48 A9 A8 28 02 EA EA 08 C9 A8 D0
FE 68 48 C9 FF D0 FE 28 C0 42 D0 FE E0 00 D0 FE
A0 42 A2 02 22 C8 CA CA D0 FE A9 00 48 A9 DD 28
22 EA EA 08 C9 DD D0 FE 68 48 C9 30 D0 FE 28 A9
FF 48 A9 88 28 22 EA EA 08 C9 88 D0 FE 68 48 C9
FF D0 FE 28 C0 42 D0 FE E0 00 D0 FE A0 42 A2 02
42 C8 CA CA D0 FE A9 00 48 A9 BD 28 42 EA EA 08
C9 BD D0 FE 68 48 C9 30 D0 FE 28 A9 FF 48 A9 68
28 42 EA EA 08 C9 68 D0 FE 68 48 C9 FF D0 FE 28
C0 42 D0 FE E0 00 D0 FE A0 42 A2 02 62 C8 CA CA
D0 FE A9 00 48 A9 9D 28 62 EA EA 08 C9 9D D0 FE
68 48 C9 30 D0 FE 28 A9 FF 48 A9 48 28 62 EA EA
08 C9 48 D0 FE 68 48 C9 FF D0 FE 28 C0 42 D0 FE
E0 00 D0 FE A0 42 A2 02 82 C8 CA CA D0 FE A9 00
48 A9 7D 28 82 EA EA 08 C9 7D D0 FE 68 48 C9 30
D0 FE 28 A9 FF 48 A9 28 28 82 EA EA 08 C9 28 D0
FE 68 48 C9 FF D0 FE 28 C0 42 D0 FE E0 00 D0 FE
A0 42 A2 02 C2 C8 CA CA D0 FE A9 00 48 A9 3D 28
C2 EA EA 08 C9 3D D0 FE 68 48 C9 30 D0 FE 28 A9
FF 48 A9 E8 28 C2 EA EA 08 C9 E8 D0 FE 68 48 C9
FF D0 FE 28 C0 42 D0 FE E0 00 D0 FE A0 42 A2 02
E2 C8 CA CA D0 FE A9 00 48 A9 1D 28 E2 EA EA 08
C9 1D D0 FE 68 48 C9 30 D0 FE 28 A9 FF 48 A9 C8
28 E2 EA EA 08 C9 C8 D0 FE 68 48 C9 FF D0 FE 28
C0 42 D0 FE E0 00 D0 FE A0 42 A2 02 44 C8 CA CA
D0 FE A9 00 48 A9 BB 28 44 EA EA 08 C9 BB D0 FE
68 48 C9 30 D0 FE 28 A9 FF 48 A9 66 28 44 EA EA
08 C9 66 D0 FE 68 48 C9 FF D0 FE 28 C0 42 D0 FE
E0 00 D0 FE A0 42 A2 02 54 C8 CA CA D0 FE A9 00
48 A9 AB 28 54 EA EA 08 C9 AB D0 FE 68 48 C9 30
D0 FE 28 A9 FF 48 A9 56 28 54 EA EA 08 C9 56 D0
FE 68 48 C9 FF D0 FE 28 C0 42 D0 FE E0 00 D0 FE
A0 42 A2 02 D4 C8 CA CA D0 FE A9 00 48 A9 2B 28
D4 EA EA 08 C9 2B D0 FE 68 48 C9 30 D0 FE 28 A9
FF 48 A9 D6 28 D4 EA EA 08 C9 D6 D0 FE 68 48 C9
FF D0 FE 28 C0 42 D0 FE E0 00 D0 FE A0 42 A2 02
F4 C8 CA CA D0 FE A9 00 48 A9 0B 28 F4 EA EA 08
C9 0B D0 FE 68 48 C9 30 D0 FE 28 A9 FF 48 A9 B6
28 F4 EA EA 08 C9 B6 D0 FE 68 48 C9 FF D0 FE 28
C0 42 D0 FE E0 00 D0 FE A0 42 A2 01 5C C8 C8 CA
D0 FE A9 00 48 A9 A3 28 5C EA EA 08 C9 A3 D0 FE
68 48 C9 30 D0 FE 28 A9 FF 48 A9 4E 28 5C EA EA
08 C9 4E D0 FE 68 48 C9 FF D0 FE 28 C0 42 D0 FE
E0 00 D0 FE A0 42 A2 01 DC C8 C8 CA D0 FE A9 00
48 A9 23 28 DC EA EA 08 C9 23 D0 FE 68 48 C9 30
D0 FE 28 A9 FF 48 A9 CE 28 DC EA EA 08 C9 CE D0
FE 68 48 C9 FF D0 FE 28 C0 42 D0 FE E0 00 D0 FE
A0 42 A2 01 FC C8 C8 CA D0 FE A9 00 48 A9 03 28
FC EA EA 08 C9 03 D0 FE 68 48 C9 30 D0 FE 28 A9
FF 48 A9 AE 28 FC EA EA 08 C9 AE D0 FE 68 48 C9
FF D0 FE 28 C0 42 D0 FE E0 00 D0 FE A0 42 A2 03
03 CA CA CA D0 FE A9 00 48 A9 FC 28 03 EA EA 08
C9 FC D0 FE 68 48 C9 30 D0 FE 28 A9 FF 48 A9 A7
28 03 EA EA 08 C9 A7 D0 FE 68 48 C9 FF D0 FE 28
C0 42 D0 FE E0 00 D0 FE A0 42 A2 03 13 CA CA CA
D0 FE A9 00 48 A9 EC 28 13 EA EA 08 C9 EC D0 FE
68 48 C9 30 D0 FE 28 A9 FF 48 A9 97 28 13 EA EA
08 C9 97 D0 FE 68 48 C9 FF D0 FE 28 C0 42 D0 FE
E0 00 D0 FE A0 42 A2 03 23 CA CA CA D0 FE A9 00
48 A9 DC 28 23 EA EA 08 C9 DC D0 FE 68 48 C9 30
D0 FE 28 A9 FF 48 A9 87 28 23 EA EA 08 C9 87 D0
FE 68 48 C9 FF D0 FE 28 C0 42 D0 FE E0 00 D0 FE
A0 42 A2 03 33 CA CA CA D0 FE A9 00 48 A9 CC 28
33 EA EA 08 C9 CC D0 FE 68 48 C9 30 D0 FE 28 A9
FF 48 A9 77 28 33 EA EA 08 C9 77 D0 FE 68 48 C9
FF D0 FE 28 C0 42 D0 FE E0 00 D0 FE A0 42 A2 03
43 CA CA CA D0 FE A9 00 48 A9 BC 28 43 EA EA 08
C9 BC D0 FE 68 48 C9 30 D0 FE 28 A9 FF 48 A9 67
28 43 EA EA 08 C9 67 D0 FE 68 48 C9 FF D0 FE 28
C0 42 D0 FE E0 00 D0 FE A0 42 A2 03 53 CA CA CA
D0 FE A9 00 48 A9 AC 28 53 EA EA 08 C9 AC D0 FE
68 48 C9 30 D0 FE 28 A9 FF 48 A9 57 28 53 EA EA
08 C9 57 D0 FE 68 48 C9 FF D0 FE 28 C0 42 D0 FE
E0 00 D0 FE A0 42 A2 03 63 CA CA CA D0 FE A9 00
48 A9 9C 28 63 EA EA 08 C9 9C D0 FE 68 48 C9 30
D0 FE 28 A9 FF 48 A9 47 28 63 EA EA 08 C9 47 D0
FE 68 48 C9 FF D0 FE 28 C0 42 D0 FE E0 00 D0 FE
A0 42 A2 03 73 CA CA CA D0 FE A9 00 48 A9 8C 28
73 EA EA 08 C9 8C D0 FE 68 48 C9 30 D0 FE 28 A9
FF 48 A9 37 28 73 EA EA 08 C9 37 D0 FE 68 48 C9
FF D0 FE 28 C0 42 D0 FE E0 00 D0 FE A0 42 A2 03
83 CA CA CA D0 FE A9 00 48 A9 7C 28 83 EA EA 08
C9 7C D0 FE 68 48 C9 30 D0 FE 28 A9 FF 48 A9 27
28 83 EA EA 08 C9 27 D0 FE 68 48 C9 FF D0 FE 28
C0 42 D0 FE E0 00 D0 FE A0 42 A2 03 93 CA CA CA
D0 FE A9 00 48 A9 6C 28 93 EA EA 08 C9 6C D0 FE
68 48 C9 30 D0 FE 28 A9 FF 48 A9 17 28 93 EA EA
08 C9 17 D0 FE 68 48 C9 FF D0 FE 28 C0 42 D0 FE
E0 00 D0 FE A0 42 A2 03 A3 CA CA CA D0 FE A9 00
48 A9 5C 28 A3 EA EA 08 C9 5C D0 FE 68 48 C9 30
D0 FE 28 A9 FF 48 A9 07 28 A3 EA EA 08 C9 07 D0
FE 68 48 C9 FF D0 FE 28 C0 42 D0 FE E0 00 D0 FE
A0 42 A2 03 B3 CA CA CA D0 FE A9 00 48 A9 4C 28
B3 EA EA 08 C9 4C D0 FE 68 48 C9 30 D0 FE 28 A9
FF 48 A9 F7 28 B3 EA EA 08 C9 F7 D0 FE 68 48 C9
FF D0 FE 28 C0 42 D0 FE E0 00 D0 FE A0 42 A2 03
C3 CA CA CA D0 FE A9 00 48 A9 3C 28 C3 EA EA 08
C9 3C D0 FE 68 48 C9 30 D0 FE 28 A9 FF 48 A9 E7
28 C3 EA EA 08 C9 E7 D0 FE 68 48 C9 FF D0 FE 28
C0 42 D0 FE E0 00 D0 FE A0 42 A2 03 D3 CA CA CA
D0 FE A9 00 48 A9 2C 28 D3 EA EA 08 C9 2C D0 FE
68 48 C9 30 D0 FE 28 A9 FF 48 A9 D7 28 D3 EA EA
08 C9 D7 D0 FE 68 48 C9 FF D0 FE 28 C0 42 D0 FE
E0 00 D0 FE A0 42 A2 03 E3 CA CA CA D0 FE A9 00
48 A9 1C 28 E3 EA EA 08 C9 1C D0 FE 68 48 C9 30
D0 FE 28 A9 FF 48 A9 C7 28 E3 EA EA 08 C9 C7 D0
FE 68 48 C9 FF D0 FE 28 C0 42 D0 FE E0 00 D0 FE
A0 42 A2 03 F3 CA CA CA D0 FE A9 00 48 A9 0C 28
F3 EA EA 08 C9 0C D0 FE 68 48 C9 30 D0 FE 28 A9
FF 48 A9 B7 28 F3 EA EA 08 C9 B7 D0 FE 68 48 C9
FF D0 FE 28 C0 42 D0 FE E0 00 D0 FE A0 42 A2 03
0B CA CA CA D0 FE A9 00 48 A9 F4 28 0B EA EA 08
C9 F4 D0 FE 68 48 C9 30 D0 FE 28 A9 FF 48 A9 9F
28 0B EA EA 08 C9 9F D0 FE 68 48 C9 FF D0 FE 28
C0 42 D0 FE E0 00 D0 FE A0 42 A2 03 1B CA CA CA
D0 FE A9 00 48 A9 E4 28 1B EA EA 08 C9 E4 D0 FE
68 48 C9 30 D0 FE 28 A9 FF 48 A9 8F 28 1B EA EA
08 C9 8F D0 FE 68 48 C9 FF D0 FE 28 C0 42 D0 FE
E0 00 D0 FE A0 42 A2 03 2B CA CA CA D0 FE A9 00
48 A9 D4 28 2B EA EA 08 C9 D4 D0 FE 68 48 C9 30
D0 FE 28 A9 FF 48 A9 7F 28 2B EA EA 08 C9 7F D0
FE 68 48 C9 FF D0 FE 28 C0 42 D0 FE E0 00 D0 FE
A0 42 A2 03 3B CA CA CA D0 FE A9 00 48 A9 C4 28
3B EA EA 08 C9 C4 D0 FE 68 48 C9 30 D0 FE 28 A9
FF 48 A9 6F 28 3B EA EA 08 C9 6F D0 FE 68 48 C9
FF D0 FE 28 C0 42 D0 FE E0 00 D0 FE A0 42 A2 03
4B CA CA CA D0 FE A9 00 48 A9 B4 28 4B EA EA 08
C9 B4 D0 FE 68 48 C9 30 D0 FE 28 A9 FF 48 A9 5F
28 4B EA EA 08 C9 5F D0 FE 68 48 C9 FF D0 FE 28
C0 42 D0 FE E0 00 D0 FE A0 42 A2 03 5B CA CA CA
D0 FE A9 00 48 A9 A4 28 5B EA EA 08 C9 A4 D0 FE
68 48 C9 30 D0 FE 28 A9 FF 48 A9 4F 28 5B EA EA
08 C9 4F D0 FE 68 48 C9 FF D0 FE 28 C0 42 D0 FE
E0 00 D0 FE A0 42 A2 03 6B CA CA CA D0 FE A9 00
48 A9 94 28 6B EA EA 08 C9 94 D0 FE 68 48 C9 30
D0 FE 28 A9 FF 48 A9 3F 28 6B EA EA 08 C9 3F D0
FE 68 48 C9 FF D0 FE 28 C0 42 D0 FE E0 00 D0 FE
A0 42 A2 03 7B CA CA CA D0 FE A9 00 48 A9 84 28
7B EA EA 08 C9 84 D0 FE 68 48 C9 30 D0 FE 28 A9
FF 48 A9 2F 28 7B EA EA 08 C9 2F D0 FE 68 48 C9
FF D0 FE 28 C0 42 D0 FE E0 00 D0 FE A0 42 A2 03
8B CA CA CA D0 FE A9 00 48 A9 74 28 8B EA EA 08
C9 74 D0 FE 68 48 C9 30 D0 FE 28 A9 FF 48 A9 1F
28 8B EA EA 08 C9 1F D0 FE 68 48 C9 FF D0 FE 28
C0 42 D0 FE E0 00 D0 FE A0 42 A2 03 9B CA CA CA
D0 FE A9 00 48 A9 64 28 9B EA EA 08 C9 64 D0 FE
68 48 C9 30 D0 FE 28 A9 FF 48 A9 0F 28 9B EA EA
08 C9 0F D0 FE 68 48 C9 FF D0 FE 28 C0 42 D0 FE
E0 00 D0 FE A0 42 A2 03 AB CA CA CA D0 FE A9 00
48 A9 54 28 AB EA EA 08 C9 54 D0 FE 68 48 C9 30
D0 FE 28 A9 FF 48 A9 FF 28 AB EA EA 08 C9 FF D0
FE 68 48 C9 FF D0 FE 28 C0 42 D0 FE E0 00 D0 FE
A0 42 A2 03 BB CA CA CA D0 FE A9 00 48 A9 44 28
BB EA EA 08 C9 44 D0 FE 68 48 C9 30 D0 FE 28 A9
FF 48 A9 EF 28 BB EA EA 08 C9 EF D0 FE 68 48 C9
FF D0 FE 28 C0 42 D0 FE E0 00 D0 FE A0 42 A2 03
EB CA CA CA D0 FE A9 00 48 A9 14 28 EB EA EA 08
C9 14 D0 FE 68 48 C9 30 D0 FE 28 A9 FF 48 A9 BF
28 EB EA EA 08 C9 BF D0 FE 68 48 C9 FF D0 FE 28
C0 42 D0 FE E0 00 D0 FE A0 42 A2 03 FB CA CA CA
D0 FE A9 00 48 A9 04 28 FB EA EA 08 C9 04 D0 FE
68 48 C9 30 D0 FE 28 A9 FF 48 A9 AF 28 FB EA EA
08 C9 AF D0 FE 68 48 C9 FF D0 FE 28 C0 42 D0 FE
E0 00 D0 FE AD 02 02 C9 08 D0 FE A9 09 8D 02 02
A2 03 BD 8B 26 9D FD 02 CA 10 F7 A9 28 8D 00 02
A9 00 48 28 A9 49 A2 4E A0 44 6C FD 02 EA D0 FE
88 88 08 88 88 88 28 F0 FE 10 FE 90 FE 50 FE C9
E3 D0 FE E0 4F D0 FE C0 3E D0 FE BA E0 FF D0 FE
AD 02 02 C9 09 D0 FE A9 0A 8D 02 02 A2 0B BD C7
26 9D F9 02 CA 10 F7 A9 27 8D 00 02 A9 00 48 28
A9 58 A2 04 A0 49 7C F9 02 EA D0 FE 88 88 08 88
88 88 28 F0 FE 10 FE 90 FE 50 FE C9 F2 D0 FE E0
06 D0 FE C0 43 D0 FE BA E0 FF D0 FE A9 08 8D 00
03 A9 17 8D 01 03 A9 05 8D 00 02 A9 17 8D 01 02
A2 FF 7C 01 02 4C 05 17 AD 02 02 C9 0A D0 FE A9
0B 8D 02 02 A9 00 48 A9 42 A2 52 A0 4B 28 00 88
08 88 88 88 C9 E8 D0 FE E0 53 D0 FE C0 45 D0 FE
68 C9 30 D0 FE BA E0 FF D0 FE A9 FF 48 A9 BD A2
AD A0 B4 28 00 88 08 88 88 88 C9 17 D0 FE E0 AE
D0 FE C0 AE D0 FE 68 C9 FF D0 FE BA E0 FF D0 FE
AD 02 02 C9 0B D0 FE A9 0C 8D 02 02 A2 AC A0 DC
A9 FF 48 A9 FE 28 1A 48 08 C9 FF D0 FE 68 48 C9
FD D0 FE 28 68 1A 48 08 C9 00 D0 FE 68 48 C9 7F
D0 FE 28 68 1A 48 08 C9 01 D0 FE 68 48 C9 7D D0
FE 28 68 3A 48 08 C9 00 D0 FE 68 48 C9 7F D0 FE
28 68 3A 48 08 C9 FF D0 FE 68 48 C9 FD D0 FE 28
68 3A A9 00 48 A9 FE 28 1A 48 08 C9 FF D0 FE 68
48 C9 B0 D0 FE 28 68 1A 48 08 C9 00 D0 FE 68 48
C9 32 D0 FE 28 68 1A 48 08 C9 01 D0 FE 68 48 C9
30 D0 FE 28 68 3A 48 08 C9 00 D0 FE 68 48 C9 32
D0 FE 28 68 3A 48 08 C9 FF D0 FE 68 48 C9 B0 D0
FE 28 68 E0 AC D0 FE C0 DC D0 FE BA E0 FF D0 FE
AD 02 02 C9 0C D0 FE A9 0D 8D 02 02 A2 99 A0 66
A9 00 48 28 B2 24 08 49 C3 28 92 30 08 49 C3 C9
C3 D0 FE 68 49 30 CD 15 02 D0 FE A9 00 48 28 B2
26 08 49 C3 28 92 32 08 49 C3 C9 82 D0 FE 68 49
30 CD 16 02 D0 FE A9 00 48 28 B2 28 08 49 C3 28
92 34 08 49 C3 C9 41 D0 FE 68 49 30 CD 17 02 D0
FE A9 00 48 28 B2 2A 08 49 C3 28 92 36 08 49 C3
C9 00 D0 FE 68 49 30 CD 18 02 D0 FE E0 99 D0 FE
C0 66 D0 FE A0 03 A2 00 B9 05 02 49 C3 D9 10 02
D0 FE 8A 99 05 02 88 10 EF A2 99 A0 66 A9 FF 48
28 B2 24 08 49 C3 28 92 30 08 49 C3 C9 C3 D0 FE
68 49 7D CD 15 02 D0 FE A9 FF 48 28 B2 26 08 49
C3 28 92 32 08 49 C3 C9 82 D0 FE 68 49 7D CD 16
02 D0 FE A9 FF 48 28 B2 28 08 49 C3 28 92 34 08
49 C3 C9 41 D0 FE 68 49 7D CD 17 02 D0 FE A9 FF
48 28 B2 2A 08 49 C3 28 92 36 08 49 C3 C9 00 D0
FE 68 49 7D CD 18 02 D0 FE E0 99 D0 FE C0 66 D0
FE A0 03 A2 00 B9 05 02 49 C3 D9 10 02 D0 FE 8A
99 05 02 88 10 EF BA E0 FF D0 FE AD 02 02 C9 0D
D0 FE A9 0E 8D 02 02 A0 7B A2 04 A9 07 95 0C 0A
CA 10 FA A2 04 A9 FF 48 A9 55 28 64 0C 64 0D 64
0E 64 0F 64 10 08 C9 55 D0 FE 68 48 C9 FF D0 FE
28 B5 0C D0 FE CA 10 F9 A2 04 A9 07 95 0C 0A CA
10 FA A2 04 A9 00 48 A9 AA 28 64 0C 64 0D 64 0E
64 0F 64 10 08 C9 AA D0 FE 68 48 C9 30 D0 FE 28
B5 0C D0 FE CA 10 F9 A2 04 A9 07 9D 05 02 0A CA
10 F9 A2 04 A9 FF 48 A9 55 28 9C 05 02 9C 06 02
9C 07 02 9C 08 02 9C 09 02 08 C9 55 D0 FE 68 48
C9 FF D0 FE 28 BD 05 02 D0 FE CA 10 F8 A2 04 A9
07 9D 05 02 0A CA 10 F9 A2 04 A9 00 48 A9 AA 28
9C 05 02 9C 06 02 9C 07 02 9C 08 02 9C 09 02 08
C9 AA D0 FE 68 48 C9 30 D0 FE 28 BD 05 02 D0 FE
CA 10 F8 A2 04 A9 07 95 0C 0A CA 10 FA A2 04 A9
FF 48 A9 55 28 74 0C 08 C9 55 D0 FE 68 48 C9 FF
D0 FE 28 CA 10 E9 A2 04 B5 0C D0 FE CA 10 F9 A2
04 A9 07 95 0C 0A CA 10 FA A2 04 A9 00 48 A9 AA
28 74 0C 08 C9 AA D0 FE 68 48 C9 30 D0 FE 28 CA
10 E9 A2 04 B5 0C D0 FE CA 10 F9 A2 04 A9 07 9D
05 02 0A CA 10 F9 A2 04 A9 FF 48 A9 55 28 9E 05
02 08 C9 55 D0 FE 68 48 C9 FF D0 FE 28 CA 10 E8
A2 04 BD 05 02 D0 FE CA 10 F8 A2 04 A9 07 9D 05
02 0A CA 10 F9 A2 04 A9 00 48 A9 AA 28 9E 05 02
08 C9 AA D0 FE 68 48 C9 30 D0 FE 28 CA 10 E8 A2
04 BD 05 02 D0 FE CA 10 F8 C0 7B D0 FE BA E0 FF
D0 FE AD 02 02 C9 0E D0 FE A9 0F 8D 02 02 A0 42
A2 03 A9 00 48 A9 FF 28 34 13 08 C9 FF D0 FE 68
48 C9 32 D0 FE 28 CA A9 00 48 A9 01 28 34 13 08
C9 01 D0 FE 68 48 C9 70 D0 FE 28 CA A9 00 48 A9
01 28 34 13 08 C9 01 D0 FE 68 48 C9 B2 D0 FE 28
CA A9 00 48 A9 01 28 34 13 08 C9 01 D0 FE 68 48
C9 F0 D0 FE 28 A9 FF 48 A9 01 28 34 13 08 C9 01
D0 FE 68 48 C9 FD D0 FE 28 E8 A9 FF 48 A9 01 28
34 13 08 C9 01 D0 FE 68 48 C9 BF D0 FE 28 E8 A9
FF 48 A9 01 28 34 13 08 C9 01 D0 FE 68 48 C9 7D
D0 FE 28 E8 A9 FF 48 A9 FF 28 34 13 08 C9 FF D0
FE 68 48 C9 3F D0 FE 28 A9 00 48 A9 FF 28 3C 10
02 08 C9 FF D0 FE 68 48 C9 32 D0 FE 28 CA A9 00
48 A9 01 28 3C 10 02 08 C9 01 D0 FE 68 48 C9 70
D0 FE 28 CA A9 00 48 A9 01 28 3C 10 02 08 C9 01
D0 FE 68 48 C9 B2 D0 FE 28 CA A9 00 48 A9 01 28
3C 10 02 08 C9 01 D0 FE 68 48 C9 F0 D0 FE 28 A9
FF 48 A9 01 28 3C 10 02 08 C9 01 D0 FE 68 48 C9
FD D0 FE 28 E8 A9 FF 48 A9 01 28 3C 10 02 08 C9
01 D0 FE 68 48 C9 BF D0 FE 28 E8 A9 FF 48 A9 01
28 3C 10 02 08 C9 01 D0 FE 68 48 C9 7D D0 FE 28
E8 A9 FF 48 A9 FF 28 3C 10 02 08 C9 FF D0 FE 68
48 C9 3F D0 FE 28 A9 00 48 A9 FF 28 89 00 08 C9
FF D0 FE 68 48 C9 32 D0 FE 28 CA A9 00 48 A9 01
28 89 41 08 C9 01 D0 FE 68 48 C9 30 D0 FE 28 CA
A9 00 48 A9 01 28 89 82 08 C9 01 D0 FE 68 48 C9
32 D0 FE 28 CA A9 00 48 A9 01 28 89 C3 08 C9 01
D0 FE 68 48 C9 30 D0 FE 28 A9 FF 48 A9 01 28 89
C3 08 C9 01 D0 FE 68 48 C9 FD D0 FE 28 E8 A9 FF
48 A9 01 28 89 82 08 C9 01 D0 FE 68 48 C9 FF D0
FE 28 E8 A9 FF 48 A9 01 28 89 41 08 C9 01 D0 FE
68 48 C9 FD D0 FE 28 E8 A9 FF 48 A9 FF 28 89 00
08 C9 FF D0 FE 68 48 C9 FF D0 FE 28 E0 03 D0 FE
C0 42 D0 FE BA E0 FF D0 FE AD 02 02 C9 0F D0 FE
A9 10 8D 02 02 A2 C0 A0 00 64 0D 98 25 0D 08 68
29 02 85 0E 98 49 FF 05 0D 49 FF 85 0F 98 05 0D
85 10 84 0C A9 FF 48 A5 0D 28 14 0C 08 C5 0D D0
FE 68 48 09 02 C9 FF D0 FE 68 29 02 C5 0E D0 FE
A5 0F C5 0C D0 FE 8C 05 02 A9 FF 48 A5 0D 28 1C
05 02 08 C5 0D D0 FE 68 48 09 02 C9 FF D0 FE 68
29 02 C5 0E D0 FE A5 0F C5 0C D0 FE 84 0C A9 00
48 A5 0D 28 14 0C 08 C5 0D D0 FE 68 48 09 02 C9
32 D0 FE 68 29 02 C5 0E D0 FE A5 0F C5 0C D0 FE
8C 05 02 A9 00 48 A5 0D 28 1C 05 02 08 C5 0D D0
FE 68 48 09 02 C9 32 D0 FE 68 29 02 C5 0E D0 FE
A5 0F C5 0C D0 FE 84 0C A9 FF 48 A5 0D 28 04 0C
08 C5 0D D0 FE 68 48 09 02 C9 FF D0 FE 68 29 02
C5 0E D0 FE A5 10 C5 0C D0 FE 8C 05 02 A9 FF 48
A5 0D 28 0C 05 02 08 C5 0D D0 FE 68 48 09 02 C9
FF D0 FE 68 29 02 C5 0E D0 FE A5 10 C5 0C D0 FE
84 0C A9 00 48 A5 0D 28 04 0C 08 C5 0D D0 FE 68
48 09 02 C9 32 D0 FE 68 29 02 C5 0E D0 FE A5 10
C5 0C D0 FE 8C 05 02 A9 00 48 A5 0D 28 0C 05 02
08 C5 0D D0 FE 68 48 09 02 C9 32 D0 FE 68 29 02
C5 0E D0 FE A5 10 C5 0C D0 FE C8 D0 04 E6 0D F0
03 4C 0B 1D E0 C0 D0 FE BA E0 FF D0 FE AD 02 02
C9 10 D0 FE A9 11 8D 02 02 A2 BA A0 D0 A9 FF 85
0C A9 00 48 A9 A5 28 07 0C 08 C9 A5 D0 FE 68 48
C9 30 D0 FE 28 A5 0C C9 FE D0 FE A9 01 85 0C A9
FF 48 A9 5A 28 07 0C 08 C9 5A D0 FE 68 48 C9 FF
D0 FE 28 A5 0C D0 FE A9 FF 85 0C A9 00 48 A9 A5
28 17 0C 08 C9 A5 D0 FE 68 48 C9 30 D0 FE 28 A5
0C C9 FD D0 FE A9 02 85 0C A9 FF 48 A9 5A 28 17
0C 08 C9 5A D0 FE 68 48 C9 FF D0 FE 28 A5 0C D0
FE A9 FF 85 0C A9 00 48 A9 A5 28 27 0C 08 C9 A5
D0 FE 68 48 C9 30 D0 FE 28 A5 0C C9 FB D0 FE A9
04 85 0C A9 FF 48 A9 5A 28 27 0C 08 C9 5A D0 FE
68 48 C9 FF D0 FE 28 A5 0C D0 FE A9 FF 85 0C A9
00 48 A9 A5 28 37 0C 08 C9 A5 D0 FE 68 48 C9 30
D0 FE 28 A5 0C C9 F7 D0 FE A9 08 85 0C A9 FF 48
A9 5A 28 37 0C 08 C9 5A D0 FE 68 48 C9 FF D0 FE
28 A5 0C D0 FE A9 FF 85 0C A9 00 48 A9 A5 28 47
0C 08 C9 A5 D0 FE 68 48 C9 30 D0 FE 28 A5 0C C9
EF D0 FE A9 10 85 0C A9 FF 48 A9 5A 28 47 0C 08
C9 5A D0 FE 68 48 C9 FF D0 FE 28 A5 0C D0 FE A9
FF 85 0C A9 00 48 A9 A5 28 57 0C 08 C9 A5 D0 FE
68 48 C9 30 D0 FE 28 A5 0C C9 DF D0 FE A9 20 85
0C A9 FF 48 A9 5A 28 57 0C 08 C9 5A D0 FE 68 48
C9 FF D0 FE 28 A5 0C D0 FE A9 FF 85 0C A9 00 48
A9 A5 28 67 0C 08 C9 A5 D0 FE 68 48 C9 30 D0 FE
28 A5 0C C9 BF D0 FE A9 40 85 0C A9 FF 48 A9 5A
28 67 0C 08 C9 5A D0 FE 68 48 C9 FF D0 FE 28 A5
0C D0 FE A9 FF 85 0C A9 00 48 A9 A5 28 77 0C 08
C9 A5 D0 FE 68 48 C9 30 D0 FE 28 A5 0C C9 7F D0
FE A9 80 85 0C A9 FF 48 A9 5A 28 77 0C 08 C9 5A
D0 FE 68 48 C9 FF D0 FE 28 A5 0C D0 FE A9 FE 85
0C A9 00 48 A9 A5 28 87 0C 08 C9 A5 D0 FE 68 48
C9 30 D0 FE 28 A5 0C C9 FF D0 FE A9 00 85 0C A9
FF 48 A9 5A 28 87 0C 08 C9 5A D0 FE 68 48 C9 FF
D0 FE 28 A5 0C C9 01 D0 FE A9 FD 85 0C A9 00 48
A9 A5 28 97 0C 08 C9 A5 D0 FE 68 48 C9 30 D0 FE
28 A5 0C C9 FF D0 FE A9 00 85 0C A9 FF 48 A9 5A
28 97 0C 08 C9 5A D0 FE 68 48 C9 FF D0 FE 28 A5
0C C9 02 D0 FE A9 FB 85 0C A9 00 48 A9 A5 28 A7
0C 08 C9 A5 D0 FE 68 48 C9 30 D0 FE 28 A5 0C C9
FF D0 FE A9 00 85 0C A9 FF 48 A9 5A 28 A7 0C 08
C9 5A D0 FE 68 48 C9 FF D0 FE 28 A5 0C C9 04 D0
FE A9 F7 85 0C A9 00 48 A9 A5 28 B7 0C 08 C9 A5
D0 FE 68 48 C9 30 D0 FE 28 A5 0C C9 FF D0 FE A9
00 85 0C A9 FF 48 A9 5A 28 B7 0C 08 C9 5A D0 FE
68 48 C9 FF D0 FE 28 A5 0C C9 08 D0 FE A9 EF 85
0C A9 00 48 A9 A5 28 C7 0C 08 C9 A5 D0 FE 68 48
C9 30 D0 FE 28 A5 0C C9 FF D0 FE A9 00 85 0C A9
FF 48 A9 5A 28 C7 0C 08 C9 5A D0 FE 68 48 C9 FF
D0 FE 28 A5 0C C9 10 D0 FE A9 DF 85 0C A9 00 48
A9 A5 28 D7 0C 08 C9 A5 D0 FE 68 48 C9 30 D0 FE
28 A5 0C C9 FF D0 FE A9 00 85 0C A9 FF 48 A9 5A
28 D7 0C 08 C9 5A D0 FE 68 48 C9 FF D0 FE 28 A5
0C C9 20 D0 FE A9 BF 85 0C A9 00 48 A9 A5 28 E7
0C 08 C9 A5 D0 FE 68 48 C9 30 D0 FE 28 A5 0C C9
FF D0 FE A9 00 85 0C A9 FF 48 A9 5A 28 E7 0C 08
C9 5A D0 FE 68 48 C9 FF D0 FE 28 A5 0C C9 40 D0
FE A9 7F 85 0C A9 00 48 A9 A5 28 F7 0C 08 C9 A5
D0 FE 68 48 C9 30 D0 FE 28 A5 0C C9 FF D0 FE A9
00 85 0C A9 FF 48 A9 5A 28 F7 0C 08 C9 5A D0 FE
68 48 C9 FF D0 FE 28 A5 0C C9 80 D0 FE E0 BA D0
FE C0 D0 D0 FE BA E0 FF D0 FE AD 02 02 C9 11 D0
FE A9 12 8D 02 02 A2 DE A0 AD A9 00 48 A9 80 28
D2 2C 08 C9 80 D0 FE 68 48 C9 31 D0 FE 28 A9 00
48 A9 7F 28 D2 2C 08 C9 7F D0 FE 68 48 C9 33 D0
FE 28 A9 00 48 A9 7E 28 D2 2C 08 C9 7E D0 FE 68
48 C9 B0 D0 FE 28 A9 FF 48 A9 80 28 D2 2C 08 C9
80 D0 FE 68 48 C9 7D D0 FE 28 A9 FF 48 A9 7F 28
D2 2C 08 C9 7F D0 FE 68 48 C9 7F D0 FE 28 A9 FF
48 A9 7E 28 D2 2C 08 C9 7E D0 FE 68 48 C9 FC D0
FE 28 E0 DE D0 FE C0 AD D0 FE BA E0 FF D0 FE AD
02 02 C9 12 D0 FE A9 13 8D 02 02 A2 42 A0 00 A5
3A 85 0C A5 3B 85 0D A9 00 48 B9 53 02 28 32 0C
08 D9 5B 02 D0 FE 68 49 30 D9 5F 02 D0 FE E6 0C
C8 C0 04 D0 E2 88 C6 0C A9 FF 48 B9 53 02 28 32
0C 08 D9 5B 02 D0 FE 68 49 7D D9 5F 02 D0 FE C6
0C 88 10 E4 A0 00 A5 42 85 0C A5 43 85 0D A9 00
48 B9 57 02 28 52 0C 08 D9 5B 02 D0 FE 68 49 30
D9 5F 02 D0 FE E6 0C C8 C0 04 D0 E2 88 C6 0C A9
FF 48 B9 57 02 28 52 0C 08 D9 5B 02 D0 FE 68 49
7D D9 5F 02 D0 FE C6 0C 88 10 E4 A0 00 A5 4A 85
0C A5 4B 85 0D A9 00 48 B9 4F 02 28 12 0C 08 D9
5B 02 D0 FE 68 49 30 D9 5F 02 D0 FE E6 0C C8 C0
04 D0 E2 88 C6 0C A9 FF 48 B9 4F 02 28 12 0C 08
D9 5B 02 D0 FE 68 49 7D D9 5F 02 D0 FE C6 0C 88
10 E4 E0 42 D0 FE BA E0 FF D0 FE AD 02 02 C9 13
D0 FE A9 14 8D 02 02 58 D8 A2 0E A0 FF A9 00 85
0C 85 0D 85 0E 8D 05 02 85 0F 85 10 A9 FF 85 12
8D 06 02 A9 02 85 11 18 20 4E 26 E6 0C E6 0F 08
08 68 29 82 28 D0 02 E6 10 05 10 85 11 38 20 4E
26 C6 0C E6 0D D0 E0 A9 00 85 10 EE 05 02 E6 0E
08 68 29 82 85 11 C6 12 CE 06 02 A5 0E 85 0F D0
C6 E0 0E D0 FE C0 FF D0 FE BA E0 FF D0 FE AD 02
02 C9 14 D0 FE A9 15 8D 02 02 F8 A2 0E A0 FF A9
99 85 0D 85 0E 8D 05 02 85 0F A9 01 85 0C 85 10
A9 81 85 11 A9 00 85 12 8D 06 02 38 20 F7 24 C6
0C A5 0F D0 08 C6 10 A9 99 85 0F D0 12 29 0F D0
0C C6 0F C6 0F C6 0F C6 0F C6 0F C6 0F C6 0F 08
68 29 82 05 10 85 11 18 20 F7 24 E6 0C A5 0D F0
15 29 0F D0 0C C6 0D C6 0D C6 0D C6 0D C6 0D C6
0D C6 0D 4C 4B 24 A9 99 85 0D A5 0E F0 39 29 0F
D0 18 C6 0E C6 0E C6 0E C6 0E C6 0E C6 0E E6 12
E6 12 E6 12 E6 12 E6 12 E6 12 C6 0E E6 12 A5 12
8D 06 02 A5 0E 8D 05 02 85 0F 08 68 29 82 09 01
85 11 E6 10 4C 4B 24 E0 0E D0 FE C0 FF D0 FE BA
E0 FF D0 FE D8 AD 02 02 C9 15 D0 FE A9 F0 8D 02
02 4C F1 24 4C 00 04 08 A5 0D 65 0E 08 C5 0F D0
FE 68 29 83 C5 11 D0 FE 28 08 A5 0D E5 12 08 C5
0F D0 FE 68 29 83 C5 11 D0 FE 28 08 A5 0D 6D 05
02 08 C5 0F D0 FE 68 29 83 C5 11 D0 FE 28 08 A5
0D ED 06 02 08 C5 0F D0 FE 68 29 83 C5 11 D0 FE
28 08 A5 0E 8D 0B 02 A5 0D 20 0A 02 08 C5 0F D0
FE 68 29 83 C5 11 D0 FE 28 08 A5 12 8D 0E 02 A5
0D 20 0D 02 08 C5 0F D0 FE 68 29 83 C5 11 D0 FE
28 08 A5 0D 75 00 08 C5 0F D0 FE 68 29 83 C5 11
D0 FE 28 08 A5 0D F5 04 08 C5 0F D0 FE 68 29 83
C5 11 D0 FE 28 08 A5 0D 7D F7 01 08 C5 0F D0 FE
68 29 83 C5 11 D0 FE 28 08 A5 0D FD F8 01 08 C5
0F D0 FE 68 29 83 C5 11 D0 FE 28 08 A5 0D 79 06
01 08 C5 0F D0 FE 68 29 83 C5 11 D0 FE 28 08 A5
0D F9 07 01 08 C5 0F D0 FE 68 29 83 C5 11 D0 FE
28 08 A5 0D 61 44 08 C5 0F D0 FE 68 29 83 C5 11
D0 FE 28 08 A5 0D E1 46 08 C5 0F D0 FE 68 29 83
C5 11 D0 FE 28 08 A5 0D 71 56 08 C5 0F D0 FE 68
29 83 C5 11 D0 FE 28 08 A5 0D F1 58 08 C5 0F D0
FE 68 29 83 C5 11 D0 FE 28 08 A5 0D 72 52 08 C5
0F D0 FE 68 29 83 C5 11 D0 FE 28 08 A5 0D F2 54
08 C5 0F D0 FE 68 29 83 C5 11 D0 FE 28 60 A5 11
29 83 48 A5 0D 45 0E 30 0A A5 0D 45 0F 10 04 68
09 40 48 68 85 11 08 A5 0D 72 52 08 C5 0F D0 FE
68 29 C3 C5 11 D0 FE 28 08 A5 0D F2 54 08 C5 0F
D0 FE 68 29 C3 C5 11 D0 FE 28 60 91 26 82 16 88
88 08 88 88 88 28 B0 FE 70 FE 30 FE F0 FE C9 49
D0 FE E0 4E D0 FE C0 41 D0 FE 48 8A 48 BA E0 FD
D0 FE 68 AA A9 FF 48 28 68 E8 49 AA 6C FF 02 EA
EA 4C C1 26 4C 00 04 0E 27 0E 27 D5 26 CE 16 0E
27 0E 27 88 88 08 88 88 88 28 B0 FE 70 FE 30 FE
F0 FE C9 58 D0 FE E0 04 D0 FE C0 46 D0 FE 48 8A
48 BA E0 FD D0 FE 68 AA A9 FF 48 28 68 E8 E8 49
AA 7C F9 02 EA EA 4C 06 27 4C 00 04 EA EA EA EA
4C 10 27 4C 00 04 4C 16 27 4C 00 04 4C 1C 27 4C
00 04 88 88 08 88 88 88 C9 BD F0 42 C9 42 D0 FE
E0 52 D0 FE C0 48 D0 FE 85 0A 86 0B BA BD 02 01
C9 30 D0 FE 68 C9 34 D0 FE BA E0 FC D0 FE AD FF
01 C9 17 D0 FE AD FE 01 C9 20 D0 FE A9 FF 48 A6
0B E8 A5 0A 49 AA 28 40 4C 68 27 4C 00 04 E0 AD
D0 FE C0 B1 D0 FE 85 0A 86 0B BA BD 02 01 C9 FF
D0 FE 68 C9 F7 D0 FE BA E0 FC D0 FE AD FF 01 C9
17 D0 FE AD FE 01 C9 46 D0 FE A9 04 48 A6 0B E8
A5 0A 49 AA 28 40 4C A6 27 4C 00 04 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 EA EA EA EA
4C D0 27 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
EA EA EA EA 4C 84 28
`;
export default RAM;
