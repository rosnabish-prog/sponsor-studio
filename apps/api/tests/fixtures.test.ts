import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { FixtureController } from '../src/modules/fixtures';

const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

test('manual fixture source refresh only reads the requested current ET day', async()=>{
  const previous=globalThis.fetch;
  let requested='';
  globalThis.fetch=async(input)=>{
    requested=String(input);
    return {ok:true,json:async()=>({items:[
      {code:'M30',date:day(),home_score:2,away_score:1,status:'finished',time:'12:30',venue:'Field 1'},
      {code:'M29',date:'2020-01-01',home_score:8,away_score:8,status:'finished'},
    ]})} as Response;
  };
  try{
    const result=await new FixtureController().refresh(day());
    assert.equal(result.matches.length,1);
    assert.equal(result.matches[0].score,'2 : 1');
    assert.equal(result.matches[0].status,'finished');
    assert.match(requested,/stats\.buildup\.club\/api\/apps\/6ad8b0035891124905a4079c\/entities\/Match/);
    await assert.rejects(()=>new FixtureController().refresh('2020-01-01'),{name:'BadRequestException'});
  }finally{globalThis.fetch=previous;}
});
