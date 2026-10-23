"""AI-assisted instrumental sketches, rendered without samples or dependencies.
Python standard library, generator version 1.0. This is synthesis, not a piano/guitar recording.
Usage: python generate_music.py --output DIRECTORY (scores beside this script).
"""
from pathlib import Path
from array import array
import argparse,math,wave,json,hashlib,struct,sys
VERSION='1.0';RATE=24000
def score(kind):
    gentle=kind=='gentle';tempo=72 if gentle else 96;beat=60/tempo
    chords=([[48,55,59,64],[45,52,55,60],[41,48,52,57],[43,50,55,60],[48,55,59,64],[45,52,55,60],[50,57,60,65],[43,50,53,59]] if gentle else [[50,57,61,66],[47,54,57,62],[43,50,54,59],[45,52,57,61],[50,57,61,66],[52,59,62,66],[43,50,54,59],[45,52,55,61]])
    motifs=([[64,67,69],[67,64,62],[60,64,65],[62,67,65],[64,71,69],[67,64,60],[65,69,67],[65,62,59]] if gentle else [[66,69,73],[71,69,66],[67,66,62],[64,69,67],[66,73,74],[71,69,66],[67,71,69],[67,64,61]])
    events=[]
    def add(at,note,duration,voice,velocity,pan=0):events.append(dict(beat=at,midi=note,duration=duration,voice=voice,velocity=velocity,pan=pan))
    for bar,chord in enumerate(chords):
        start=bar*4
        for j,n in enumerate(chord):add(start+j*.035,n,4.2,'pad',.16 if gentle else .11,(j-1.5)*.28)
        add(start,chord[0]-12,2.8 if gentle else 1.65,'bass',.27 if gentle else .24,-.08)
        if gentle:
            for j,n in enumerate([chord[1]+12,chord[2]+12,chord[3],chord[1]+12]):add(start+.15+j*.9,n,1.8,'keys',.15+(.03 if j==0 else 0),(j%2-.5)*.4)
        else:
            arp=[chord[0]+12,chord[1]+12,chord[2]+12,chord[3],chord[2]+12,chord[1]+12,chord[3],chord[1]+12]
            for j,n in enumerate(arp):add(start+j*.5+.02,n,1.1,'pluck',.24 if j%2==0 else .18,(j%3-1)*.23)
        for j,n in enumerate(motifs[bar]):add(start+[.55,1.8,2.9][j],n,1.7 if j<2 else 2.2,'keys' if gentle else 'pluck',.36 if j==0 else .30,(j-1)*.12)
    return dict(id=kind,title_zh='温柔回忆' if gentle else '轻快旅行',title_en='Gentle Memories' if gentle else 'Light Travels',version=VERSION,tempo_bpm=tempo,meter='4/4',bars=8,key='C major / A minor' if gentle else 'D major / B minor',sample_rate=RATE,loop_beats=32,attribution='AI-assisted arrangement by OpenAI Codex, 2026-10-23; program synthesis, no third-party recordings or quoted score; not attributed as the website owner\'s composition.',events=events)
def render(data):
    beat=60/data['tempo_bpm'];length=round(data['loop_beats']*beat*RATE)
    left=array('d',[0.])*length;right=array('d',[0.])*length
    for e in data['events']:
        voice=e['voice'];duration=e['duration']*beat;tail=duration+(.9 if voice=='pad' else 1.15);offset=round(e['beat']*beat*RATE)
        f=440*2**((e['midi']-69)/12);pan=e['pan'];lg=math.sqrt((1-pan)/2);rg=math.sqrt((1+pan)/2)
        for i in range(round(tail*RATE)):
            t=i/RATE;phase=2*math.pi*f*t
            if voice=='pad':
                attack=min(1,t/.22);release=max(0,1-max(0,t-duration)/.9);env=attack*release*.7
                tone=math.sin(phase)*.74+math.sin(phase*1.0018)*.18+math.sin(phase*2)*.08
            elif voice=='bass':
                env=min(1,t/.018)*math.exp(-t/1.1)*min(1,max(0,tail-t)/.04)
                tone=math.sin(phase)+.12*math.sin(phase*2)
            else:
                env=(1-math.exp(-t/(.014 if voice=='keys' else .007)))*min(1,max(0,tail-t)/.07)
                tone=math.sin(phase)*math.exp(-t/(1.35 if voice=='keys' else .62))+.22*math.sin(phase*2.002)*math.exp(-t/.35)+.065*math.sin(phase*3.006)*math.exp(-t/.16)
            value=tone*env*e['velocity']
            at=(offset+i)%length;left[at]+=value*lg;right[at]+=value*rg
    # Circular quiet room taps preserve note tails across the loop boundary.
    dry_l=array('d',left);dry_r=array('d',right)
    for delay,gain in [(.097,.14),(.173,.10),(.293,.065),(.421,.045)]:
        shift=round(delay*RATE)
        for i in range(length):left[i]+=dry_r[(i-shift)%length]*gain;right[i]+=dry_l[(i-shift)%length]*gain
    peak=max(max(map(abs,left)),max(map(abs,right)));rms=math.sqrt((sum(v*v for v in left)+sum(v*v for v in right))/(2*length));gain=min(.76/peak,.13/rms)
    pcm=array('h');square=0.;maximum=0.;seam=0.
    for l,r in zip(left,right):
        for v in (l*gain,r*gain):pcm.append(round(max(-1,min(1,v))*32767));square+=v*v;maximum=max(maximum,abs(v))
    if sys.byteorder!='little':pcm.byteswap()
    return pcm.tobytes(),dict(duration_seconds=length/RATE,channels=2,sample_rate=RATE,peak=maximum,rms=math.sqrt(square/(2*length)),loop_edge_step=max(abs(left[0]-left[-1]),abs(right[0]-right[-1]))*gain)
def vlq(n):
    out=[n&127];n>>=7
    while n:out.insert(0,(n&127)|128);n>>=7
    return bytes(out)
def midi(data):
    ticks=480;events=[];program={'keys':4,'pluck':24,'pad':89,'bass':32};channel={v:i for i,v in enumerate(program)}
    for v,p in program.items():events.append((0,bytes([0xc0+channel[v],p])))
    events.append((0,b'\xff\x51\x03'+round(60000000/data['tempo_bpm']).to_bytes(3,'big')))
    for e in data['events']:
        ch=channel[e['voice']];at=round(e['beat']*ticks);end=round((e['beat']+e['duration'])*ticks)
        events.extend([(at,bytes([0x90+ch,e['midi'],max(1,round(e['velocity']*110))])),(end,bytes([0x80+ch,e['midi'],0]))])
    body=bytearray();last=0
    for t,msg in sorted(events,key=lambda x:x[0]):body.extend(vlq(t-last)+msg);last=t
    body.extend(b'\x00\xff\x2f\x00');return b'MThd'+struct.pack('>IHHH',6,0,1,ticks)+b'MTrk'+struct.pack('>I',len(body))+body
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);parser.add_argument('--scores',type=Path);args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=False);manifest={}
    for kind in ['gentle','travel']:
        data=json.loads((args.scores/kind/'score.json').read_text(encoding='utf8')) if args.scores else score(kind);folder=args.output/kind;folder.mkdir();pcm,stats=render(data)
        file=folder/(kind+'.wav')
        with wave.open(str(file),'wb') as wav:wav.setnchannels(2);wav.setsampwidth(2);wav.setframerate(RATE);wav.writeframes(pcm)
        (folder/'score.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8');(folder/(kind+'.mid')).write_bytes(midi(data))
        stats.update(wav_sha256=hashlib.sha256(file.read_bytes()).hexdigest(),generator_version=VERSION);manifest[kind]=stats;print(kind,json.dumps(stats),flush=True)
    (args.output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
if __name__=='__main__':main()
