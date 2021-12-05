## To Do List

[ ] implement a queue (unique queue? or some sort of hash) with debounce on clearing out. only put directories into the queue and not files. 
[ ] Don't trigger any action on directory changes, only files.
[ ] Figure out if we need to postpone watch until build is completed; perform a single sync as a final step and then trigger the watch.