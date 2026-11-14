"""Materialize tasks from independently authored passages; never author source/gold text."""
import json
from pathlib import Path
root = Path(__file__).parent
def derive(name, held_out):
    passages=json.loads((root/name).read_text()); cases=[]
    for index,p in enumerate(passages):
        for category in ['wording','extraction','missing-info','injection']:
            if not held_out and category == ('wording' if p['extraction']['section']=='education' else ['extraction','wording','missing-info','injection'][index%4]): continue
            extraction=category=='extraction'; missing=category=='missing-info'; injection=category=='injection'
            ext=p['extraction']
            facts=([ext['rawDateText']] if ext['rawDateText'] else [str(ext['value'])]) if extraction else p['facts']
            cases.append(dict(id=p['id']+'-'+category,passageId=p['id'],sector=p['sector'],language=p['language'],structure=p['structure'],task=p['task'],category=category,kind='extraction' if extraction else 'wording',input=p['input']+(p['injection'] if injection else ''),intent=('Extract only '+ext['field']+' from the '+ext['section']+' section.' if extraction else 'Ask for the missing '+p['missingField']+'; do not guess or rewrite.' if missing else p['task']+'; preserve all career facts.'),safeText=p['safe'],acceptableOutputs=[str(ext['value']) if extraction else p['safe']],requiredFacts=[] if missing else facts,factAlternatives=p.get('factAlternatives',{}),forbiddenClaims=p['forbidden'],forbiddenPatterns=[],requiresQuestion=missing,improvementExpected=not extraction and not missing,missingField=p['missingField'],question=p['question'],questionTargets=p['targets'],clarity=p['clarity'],difficulty='hard' if injection or 'لم ' in p['input'] or 'not ' in p['input'] or 'هـ' in p['input'] else 'medium' if p['language']=='mixed' or extraction or 'history' in p['structure'] else 'easy',combined=injection and ('هـ' in p['input'] or p['language']=='mixed'),holdout=held_out,exploratory=False,attack=p['safe']+' '+p['forbidden'][0] if not missing and not extraction else None,**({'extraction':ext} if extraction else {})))
    (root/('holdout.json' if held_out else 'fixtures.json')).write_text(json.dumps(cases,ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':
    import sys
    derive(sys.argv[1],'--holdout' in sys.argv)
