"""Small host-only cache-aside reference. Not a distributed Valkey implementation."""
from collections import OrderedDict
from copy import deepcopy
import hashlib
import json
import math
from threading import Condition, Event, RLock
import time

class CacheAside:
    def __init__(self, fetch, *, ttl=60, max_entries=100, jitter=0, clock=time.monotonic):
        if not isinstance(ttl,(int,float)) or not math.isfinite(ttl) or ttl<=0:raise ValueError('ttl must be positive finite seconds')
        if not isinstance(max_entries,int) or max_entries<1:raise ValueError('max_entries must be a positive integer')
        if not isinstance(jitter,(int,float)) or not math.isfinite(jitter) or not 0<=jitter<=ttl/2:raise ValueError('jitter must be between0 and half TTL')
        self.fetch,self.ttl,self.max_entries,self.jitter,self.clock=fetch,ttl,max_entries,jitter,clock
        self.entries=OrderedDict();self.flights={};self.lock=RLock();self.changed=Condition(self.lock)
        self.stats={k:0 for k in ['requests','hits','misses','coalesced','db_reads','evictions','invalidations','errors']}

    @staticmethod
    def key(tenant,product):
        if not all(isinstance(x,str) and x for x in (tenant,product)):raise ValueError('nonempty tenant and product required')
        return json.dumps(['catalog-v1',tenant,product],separators=(',',':'))

    def invalidate(self,tenant,product):
        key=self.key(tenant,product)
        with self.lock:
            self.entries.pop(key,None)
            if key in self.flights:self.flights[key]['invalidated']=True
            self.stats['invalidations']+=1

    def get(self,tenant,product):
        key=self.key(tenant,product);waited=False
        with self.lock:self.stats['requests']+=1
        for _ in range(8):
            with self.lock:
                hit=self.entries.get(key)
                if hit and hit[0]>self.clock():
                    self.entries.move_to_end(key)
                    if not waited:self.stats['hits']+=1
                    return deepcopy(hit[1])
                self.entries.pop(key,None)
                flight=self.flights.get(key)
                leader=flight is None
                if leader:
                    flight={'event':Event(),'invalidated':False};self.flights[key]=flight;self.stats['misses']+=1
                elif not waited:
                    waited=True;self.stats['coalesced']+=1;self.changed.notify_all()
            if not leader:
                if not flight['event'].wait(5):raise TimeoutError('cache refill still pending; retry with bounded backoff')
                continue
            try:
                for _ in range(3):
                    with self.lock:self.stats['db_reads']+=1
                    row=self.fetch(tenant,product)
                    if row is not None and (not isinstance(row,dict) or row.get('tenant')!=tenant or row.get('product')!=product):raise ValueError('origin row does not match requested tenant/product')
                    with self.lock:
                        if flight['invalidated']:
                            flight['invalidated']=False
                            continue
                        # Downward jitter preserves maximum TTL; negative cache lives at most1second.
                        fraction=int.from_bytes(hashlib.sha256(key.encode()).digest()[:4],'big')/(2**32-1)
                        age=min(self.ttl,1) if row is None else self.ttl-fraction*self.jitter
                        self.entries[key]=(self.clock()+age,deepcopy(row));self.entries.move_to_end(key)
                        while len(self.entries)>self.max_entries:self.entries.popitem(last=False);self.stats['evictions']+=1
                        return deepcopy(row)
                raise RuntimeError('catalog changed repeatedly during fill; retry with bounded backoff')
            except Exception:
                with self.lock:self.stats['errors']+=1
                raise
            finally:
                with self.lock:
                    self.flights.pop(key,None);flight['event'].set();self.changed.notify_all()
        raise RuntimeError('repeated cache refill contention; retry with bounded backoff')
