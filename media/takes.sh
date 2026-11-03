#!/usr/bin/env bash
# Final takes, one profile so My Home collects every machine. Usage: ./takes.sh dryer|car|microwave|home
set -uo pipefail
cd "$(dirname "$0")"
export PROFILE=.profile-final
rec() { timeout 2400 uv run -q --with playwright python rec.py "$@"; }
case "$1" in
dryer) rec goto:/app wait:1200 \
 rec:10-capture wait:1200 tap:"Show me" wait:1500 upload:dryer-label.jpg wait:900 type:textarea::"My dryer runs a full hour and the clothes are still wet" wait:600 tap:"Help me fix it" plan wait:1500 snap:c-plan stop \
 gone:"Drawing the fix" rec:11-plan-scroll wait:800 smooth:350 wait:2500 smooth:400 wait:1500 smooth:400 wait:1500 snap:c-plan2 stop \
 rec:12-steps tap:"Let's start" wait:7000 snap:c-step1 tap:Next wait:6000 snap:c-step2 stop \
 rec:13-ask tap:"I'm stuck" wait:1200 tap:"Ask Helpa" wait:1000 type:".ask-sheet input"::"Which way does the lint screen come out?" wait:400 click:.ask-send wait:12000 snap:c-ask stop \
 click:"[aria-label=Close]" wait:800 rec:14-check tap:"I'm stuck" wait:1000 tap:"Check what I did" wait:1500 upload:dryer-lint-slot.jpg wait:15000 snap:c-check stop \
 tap:"Skip, it's fine" wait:1500 rec:15-finish through:2200 tap:"All done" wait:2500 snap:c-test tap:"Still broken" wait:2000 plan wait:3500 snap:c-plan-b stop \
 rec:16-vent tap:"Let's start" through:3000 tap:"All done" wait:2500 tap:"Still broken" wait:2000 plan wait:3500 snap:c-plan-c stop \
 rec:17-pro tap:"Let's start" wait:2500 tap:"I'm stuck" wait:1200 tap:"Hand it to a pro" wait:3500 snap:c-pro2 stop \
 rec:18-findpros tap:"Find pros near me" waittext:"Fair price" wait:2500 snap:c-pros smooth:500 wait:2000 smooth:500 wait:2000 snap:c-pros2 stop \
 rec:19-contact tap:Contact wait:2000 snap:c-contact click:"input[type=checkbox]" wait:800 tap:"Let Helpa reach out" wait:9000 snap:c-reply stop \
 rec:20-accept tap:Accept wait:4000 snap:c-booked stop \
 rec:21-prosaid scroll:"What did the pro say?" wait:1000 type:"textarea"::"It's the thermal fuse, part 279973, 140 dollars" wait:500 tap:"Update the job" wait:15000 snap:c-said stop ;;
car) rec goto:/app wait:1200 \
 rec:40-car wait:800 tap:"Show me" wait:1300 upload:car.jpg wait:800 type:textarea::"My 2015 Camry needs an oil change" wait:500 tap:"Help me fix it" plan wait:2500 snap:car-plan stop \
 rec:41-car-steps tap:"Let's start" wait:6500 tap:Next wait:6500 tap:Next wait:6000 snap:car-step stop \
 click:"[aria-label='Back to the plan']" wait:1000 rec:42-part scroll:"Find this part for my model" wait:800 tap:"Find this part for my model" wait:2500 smooth:500 wait:800 click:"text=04152-YZZA1" wait:1500 snap:part-0 waittext:"Buy it" wait:2500 snap:part-found smooth:300 wait:1500 tap:"Buy it" wait:9000 snap:part-arrived tap:"Install it now" wait:6000 snap:part-install stop ;;
microwave) rec goto:/app wait:1200 \
 rec:30-microwave-capture wait:800 tap:"Show me" wait:1300 upload:microwave-label.jpg wait:800 type:textarea::"My microwave runs and the light is on but it doesn't heat the food" wait:500 tap:"Help me fix it" plan:1 wait:3000 snap:mw-plan smooth:400 wait:2500 snap:mw-plan2 stop ;;
part) rec goto:/app wait:1500 text:"My 2015 Camry needs an oil change" wait:2000 \
 rec:42-part wait:1000 click:"text=04152-YZZA1" wait:1500 snap:part-0 waittext:"Buy it" wait:2500 snap:part-found smooth:300 wait:1500 tap:"Buy it" wait:9000 snap:part-arrived tap:"Install it now" wait:6000 snap:part-install stop ;;
home) rec goto:/app wait:1500 \
 rec:50-home wait:3000 snap:home smooth:400 wait:2500 snap:home2 stop ;;
esac
